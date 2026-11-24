import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { executeApprovedActions, pendingActionInputSchema } from "../src/agent/gameplay.js";
import { getConfig } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";
import { SpaceMoltClient } from "../src/spacemolt/client.js";

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
  const actions = await executeApprovedActions(client, parsed.data.sessionId, parsed.data.actions.map((action) => ({
    id: action.id,
    tool: action.tool,
    action: action.action,
    args: action.args,
    reason: action.reason,
  })));
  const failed = actions.filter((action) => !action.ok);
  res.status(200).json({
    ok: failed.length === 0,
    actions,
    error: failed.length > 0 ? `${failed.length} action(s) failed. See action results.` : undefined,
  });
}
