import http from "node:http";
import { InvalidTokenError, observeWithToken } from "./agent/observe.js";
import { getConfig, safeConfigSummary } from "./config/env.js";
import { bearerToken } from "./http/auth.js";
import { corsHeaders } from "./http/cors.js";
import { log } from "./logger.js";

const port = Number(process.env.PORT || 3000);

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const cfg = getConfig();
    const cors = corsHeaders(cfg.ALLOWED_ORIGIN, req.headers.origin);

    if (req.method === "OPTIONS" && (req.url === "/api/health" || req.url === "/api/observe")) {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.url === "/api/health") {
      send(res, 200, { ok: true, service: "spacemolt-agent-backend", ...safeConfigSummary(cfg) }, cors);
      return;
    }

    if (req.url === "/api/observe") {
      const headers = { ...cors, "Cache-Control": "no-store" };
      if (req.method !== "POST") {
        send(res, 405, { ok: false, error: "Method not allowed" }, headers);
        return;
      }
      const token = bearerToken(req.headers.authorization);
      if (!token || token.length > 512) {
        send(res, 401, { ok: false, error: "Missing or invalid Authorization header" }, headers);
        return;
      }
      const result = await observeWithToken(token);
      send(res, result.ok ? 200 : 502, result, headers);
      return;
    }

    send(res, 404, { ok: false, error: "Not found" }, cors);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      send(res, 401, { ok: false, error: err.message }, { "Cache-Control": "no-store" });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("dev.request_failed", { message });
    send(res, 500, { ok: false, error: "Internal error" });
  }
});

server.listen(port, () => {
  console.log(`spacemolt-agent-backend dev server on :${port}`);
});
