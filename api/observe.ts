import type { VercelRequest, VercelResponse } from "@vercel/node";
import { InvalidTokenError, observeWithToken } from "../src/agent/observe.js";
import { getConfig } from "../src/config/env.js";
import { bearerToken } from "../src/http/auth.js";
import { corsHeaders } from "../src/http/cors.js";
import { log } from "../src/logger.js";

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

    const token = bearerToken(req.headers.authorization);
    if (!token || token.length > 512) {
      res.status(401).json({ ok: false, error: "Missing or invalid Authorization header" });
      return;
    }

    const result = await observeWithToken(token);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      res.status(401).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("observe.handler_failed", { message });
    res.status(500).json({ ok: false, error: "Internal error" });
  }
}
