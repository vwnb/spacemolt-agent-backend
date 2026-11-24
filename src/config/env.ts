import { z } from "zod";
import {
  getProviderOption,
  resolveModel,
  type LLMProviderKey,
  type ProviderOption,
} from "../reasoning/models.js";

const envSchema = z.object({
  SPACEMOLT_BASE_URL: z.string().url().default("https://game.spacemolt.com/api/v2"),
  ALLOWED_ORIGIN: z.string().optional().default(""),

  LLM_PROVIDER: z.enum(["openrouter", "openapi", "opper"]).default("openrouter"),
  LLM_BASE_URL: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPPER_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().optional().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_EXTRA_HEADERS_JSON: z.string().optional().default(""),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  llmProvider: LLMProviderKey;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmExtraHeaders: Record<string, string>;
};

export type ProviderRuntime = {
  providerKey: LLMProviderKey;
  provider: ProviderOption;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  extraHeaders: Record<string, string>;
};

let cached: AppConfig | undefined;

export class ProviderConfigError extends Error {}

function apiKeyFor(providerKey: LLMProviderKey, env: z.infer<typeof envSchema>): string {
  if (providerKey === "openrouter") return env.OPENROUTER_API_KEY || env.LLM_API_KEY;
  if (providerKey === "opper") return env.OPPER_API_KEY;
  return env.LLM_API_KEY;
}

function missingKeyError(providerKey: LLMProviderKey): string {
  if (providerKey === "openrouter") return "OPENROUTER_API_KEY (or LLM_API_KEY) is required";
  if (providerKey === "opper") return "OPPER_API_KEY is required to use Opper";
  return "LLM_API_KEY is required";
}

function parseExtraHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM_EXTRA_HEADERS_JSON must be a JSON object");
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") throw new Error(`LLM_EXTRA_HEADERS_JSON.${key} must be string`);
    headers[key] = value;
  }
  return headers;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.parse(env);
  const provider = getProviderOption(parsed.LLM_PROVIDER);

  const llmBaseUrl = (parsed.LLM_BASE_URL || provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const llmApiKey = apiKeyFor(provider.key, parsed);
  const llmModel = resolveModel(provider, parsed.LLM_MODEL);

  if (!llmApiKey) throw new ProviderConfigError(missingKeyError(provider.key));
  if (!llmModel) throw new ProviderConfigError("LLM_MODEL is required");

  let llmExtraHeaders = parseExtraHeaders(parsed.LLM_EXTRA_HEADERS_JSON);
  if (provider.key === "openrouter") {
    llmExtraHeaders = {
      "HTTP-Referer": llmExtraHeaders["HTTP-Referer"] ?? "https://spacemolt.com",
      "X-Title": llmExtraHeaders["X-Title"] ?? "spacemolt-agent-backend",
      ...llmExtraHeaders,
    };
  }

  const cfg: AppConfig = {
    ...parsed,
    llmProvider: provider.key,
    llmBaseUrl,
    llmApiKey,
    llmModel,
    llmExtraHeaders,
  };
  if (env === process.env) cached = cfg;
  return cfg;
}

export function resolveProviderRuntime(cfg: AppConfig, providerKey: LLMProviderKey): ProviderRuntime {
  const provider = getProviderOption(providerKey);
  const apiKey = apiKeyFor(providerKey, cfg);
  if (!apiKey) throw new ProviderConfigError(missingKeyError(providerKey));

  const baseUrl = providerKey === cfg.llmProvider
    ? cfg.llmBaseUrl
    : (providerKey === "openapi"
      ? (cfg.LLM_BASE_URL || "https://api.openai.com/v1")
      : provider.baseUrl).replace(/\/+$/, "");
  const model = providerKey === cfg.llmProvider ? cfg.llmModel : provider.defaultModel;
  if (!model) throw new ProviderConfigError("LLM_MODEL is required");

  let extraHeaders = parseExtraHeaders(cfg.LLM_EXTRA_HEADERS_JSON);
  if (providerKey === "openrouter") {
    extraHeaders = {
      "HTTP-Referer": extraHeaders["HTTP-Referer"] ?? "https://spacemolt.com",
      "X-Title": extraHeaders["X-Title"] ?? "spacemolt-agent-backend",
      ...extraHeaders,
    };
  }

  return {
    providerKey,
    provider,
    baseUrl,
    apiKey,
    model,
    timeoutMs: cfg.LLM_TIMEOUT_MS,
    extraHeaders,
  };
}

export function safeConfigSummary(cfg: AppConfig) {
  return {
    spacemoltBaseUrl: cfg.SPACEMOLT_BASE_URL,
    allowedOrigin: cfg.ALLOWED_ORIGIN,
    llmProvider: cfg.llmProvider,
    llmBaseUrl: cfg.llmBaseUrl,
    llmModel: cfg.llmModel,
    logLevel: cfg.LOG_LEVEL,
  };
}
