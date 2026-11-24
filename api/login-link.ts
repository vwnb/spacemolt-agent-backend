import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectFailureMessage } from "../src/agent/connect.js";
import { startLoginLink } from "../src/agent/loginLink.js";
import { getConfig } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";

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

    res.status(200).json(await startLoginLink());
  } catch (err) {
    const { message, status } = connectFailureMessage(err);
    res.status(status).json({ ok: false, error: message });
  }
}
