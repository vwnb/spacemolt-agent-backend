import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { connectFailureMessage } from "../src/agent/connect.js";
import { executeGameAction, parseGameAction, requiresApproval, type GameActionRecord } from "../src/agent/gameplay.js";
import { getConfig } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";
import { SpaceMoltClient } from "../src/spacemolt/client.js";

const inputSchema = z.object({
  sessionId: z.string().min(1).max(512),
  tool: z.string().min(1).max(80).default("spacemolt"),
  action: z.string().min(1).max(80),
  args: z.record(z.unknown()).default({}),
}).strict();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
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

    const raw = {
      tool: parsed.data.tool,
      action: parsed.data.action,
      args: parsed.data.args,
    };
    const action = parseGameAction(raw);
    if (!action.ok) {
      res.status(400).json({ ok: false, error: action.error });
      return;
    }
    if (requiresApproval(action.action)) {
      res.status(403).json({ ok: false, error: "Action requires approval" });
      return;
    }

    const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);
    const result: GameActionRecord = await executeGameAction(client, parsed.data.sessionId, action.action);
    res.status(result.ok ? 200 : 502).json({ ok: result.ok, action: result, error: result.error });
  } catch (err) {
    const { message, status } = connectFailureMessage(err);
    res.status(status).json({ ok: false, error: message });
  }
}
