import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { executeApprovedActions, pendingActionInputSchema } from "../src/agent/gameplay.js";
import { getConfig } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";
import { SpaceMoltClient } from "../src/spacemolt/client.js";

const DEFERRED_RESPONSE_MS = 45_000;

const approvedActionInputSchema = pendingActionInputSchema.extend({
  approval: z.literal(true).optional(),
});

const inputSchema = z.object({
  sessionId: z.string().min(1).max(512),
  actions: z.array(approvedActionInputSchema).min(1).max(10),
}).strict();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const cfg = getConfig();
  for (const [name, value] of Object.entries(corsHeaders(cfg.ALLOWED_ORIGIN, req.headers.origin))) {
    res.setHeader(name, value);
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ ok: false, error: issue?.message ?? "Invalid request" });
    return;
  }

  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);
  const approvedActions = parsed.data.actions.map((action) => ({
    id: action.id,
    tool: action.tool,
    action: action.action,
    args: action.args,
    reason: action.reason,
  }));
  let responded = false;
  const execution = executeApprovedActions(client, parsed.data.sessionId, approvedActions)
    .then((actions) => {
      if (responded) return;
      responded = true;
      const failed = actions.filter((action) => !action.ok);
      res.status(200).json({
        ok: failed.length === 0,
        actions,
        error: failed.length > 0 ? `${failed.length} action(s) failed. See action results.` : undefined,
      });
    })
    .catch((err: unknown) => {
      if (responded) return;
      responded = true;
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deferred = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      if (responded) {
        resolve();
        return;
      }
      responded = true;
      const actions = approvedActions.map((action) => ({
        tool: action.tool,
        action: action.action,
        args: action.args,
        ok: true,
        pending: true,
        result: "Action submitted; still in progress.",
      }));
      res.status(202).json({ ok: true, pending: true, actions });
      resolve();
    }, DEFERRED_RESPONSE_MS);
  });

  await Promise.race([execution, deferred]);
  if (timer !== undefined) clearTimeout(timer);
}
