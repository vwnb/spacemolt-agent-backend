import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { connectFailureMessage } from "../src/agent/connect.js";
import { pollLoginLink } from "../src/agent/loginLink.js";
import { getConfig } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";

const inputSchema = z.object({
  linkSessionId: z.string().min(1).max(512),
  deviceCode: z.string().min(1).max(512),
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

    res.status(200).json(await pollLoginLink(parsed.data.linkSessionId, parsed.data.deviceCode));
  } catch (err) {
    const { message, status } = connectFailureMessage(err);
    res.status(status).json({ ok: false, error: message });
  }
}
