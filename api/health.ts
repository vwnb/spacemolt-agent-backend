import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConfig, safeConfigSummary } from "../src/config/env.js";
import { corsHeaders } from "../src/http/cors.js";
import { getModelChoices, LLM_PROVIDER_OPTIONS } from "../src/reasoning/models.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const cfg = getConfig();
    res.setHeader("Cache-Control", "no-store");
    for (const [name, value] of Object.entries(corsHeaders(cfg.ALLOWED_ORIGIN, req.headers.origin))) {
      res.setHeader(name, value);
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const entries = await Promise.all(LLM_PROVIDER_OPTIONS.map(async (provider) => {
      const configured = provider.key === cfg.llmProvider ? cfg.llmModel : "";
      return [provider.key, await getModelChoices(provider.key, configured)] as const;
    }));
    const byProvider = Object.fromEntries(entries);
    const models = byProvider[cfg.llmProvider];

    res.status(200).json({
      ok: true,
      service: "spacemolt-agent-backend",
      ...safeConfigSummary(cfg),
      llmProviders: LLM_PROVIDER_OPTIONS.map(({ key, label, envKey, defaultModel }) => ({
        key,
        label,
        envKey,
        defaultModel,
      })),
      llmModelOptions: models.choices,
      llmModelOptionsSource: models.source,
      llmModelOptionsFetchedAt: models.fetchedAt,
      llmModelOptionsByProvider: Object.fromEntries(
        entries.map(([key, value]) => [key, {
          choices: value.choices,
          source: value.source,
          fetchedAt: value.fetchedAt,
        }]),
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
}
