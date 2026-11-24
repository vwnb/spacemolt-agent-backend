import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { chatWithAgent } from "../src/agent/chat.js";
import { connectFailureMessage } from "../src/agent/connect.js";
import { getConfig, ProviderConfigError, resolveProviderRuntime } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";
import { isAllowedModel } from "../src/reasoning/models.js";

const inputSchema = z.object({
  sessionId: z.string().min(1).max(512),
  message: z.string().min(1).max(4000),
  objective: z.string().max(2000).optional(),
  provider: z.enum(["openrouter", "openapi", "opper"]).optional(),
  model: z.string().min(1).max(200).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .transform((history) => history.slice(-20))
    .default([]),
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
    const providerKey = parsed.data.provider ?? cfg.llmProvider;
    const runtime = resolveProviderRuntime(cfg, providerKey);
    if (parsed.data.model && !(await isAllowedModel(providerKey, runtime.model, parsed.data.model))) {
      res.status(400).json({ ok: false, error: "Unsupported model" });
      return;
    }

    res.status(200).json(await chatWithAgent(parsed.data));
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    const { message, status } = connectFailureMessage(err);
    res.status(status).json({ ok: false, error: message });
  }
}
