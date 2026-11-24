import { log } from "../logger.js";

export type LLMProviderKey = "openrouter" | "openapi" | "opper";

export interface ModelOption {
  id: string;
  label: string;
  free?: boolean;
}

export interface ProviderOption {
  key: LLMProviderKey;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: ModelOption[];
  envKey: string;
}

export interface ModelChoice {
  id: string;
  label: string;
}

type OpenRouterModel = {
  id: string;
  name?: string;
  created?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};

type OpperModel = {
  id: string;
  name?: string;
  type?: string;
  quality?: string;
  speed?: string;
  capabilities?: string[];
  output_modalities?: string[];
  pricing?: { billing_unit?: string; input?: number[]; output?: number[] };
};

type ModelSource = "openrouter" | "opper" | "fallback" | "configured";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPPER_MODELS_URL = "https://api.opper.ai/v3/models";
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const OPPER_MAX_INPUT_PER_MTOK = 0.25;
const OPPER_MAX_OUTPUT_PER_MTOK = 1;
const OPPER_CHOICE_LIMIT = 24;

const FALLBACK_OPENROUTER_MODELS: ModelOption[] = [
  { id: "inclusionai/ling-3.2-flash:free", label: "inclusionAI: Ling 3.2 Flash (free)", free: true },
  { id: "baidu/ernie-5.5-flash-preview:free", label: "Baidu: ERNIE-5.5-Flash-Preview (free)", free: true },
  { id: "liquid/lfm-3-1.7b:free", label: "LiquidAI: LFM3-1.7B (free)", free: true },
  { id: "particle-ai/particle-1:free", label: "Particle AI: Particle-1 (free)", free: true },
  { id: "recursive/flint-v1.0:free", label: "Recursive: Flint (free)", free: true },
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "NVIDIA: Nemotron 3.5 Super VL (free)", free: true },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "NVIDIA: Nemotron 3.5 Lightning (free)", free: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "NVIDIA: Nemotron 3 Ultra (free)", free: true },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "NVIDIA: Nemotron 3 Nano Omni (free)", free: true },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Google: Gemma 4 26B A4B (free)", free: true },
  { id: "google/gemma-4-31b-it:free", label: "Google: Gemma 4 31B (free)", free: true },
  { id: "openrouter/free", label: "Free Models Router", free: true },
];

const FALLBACK_OPPER_MODELS: ModelOption[] = [
  { id: "openai:flex/gpt-5-mini", label: "GPT-5 Mini (Opper, $0.125/$1 per 1M, great)" },
  { id: "alibaba:eu/qwen3.8-flash", label: "Qwen3.8 Flash (Opper, $0.164/$0.514 per 1M, great)" },
  { id: "openai:flex/gpt-5-nano", label: "GPT-5 Nano (Opper, $0.025/$0.2 per 1M, good)" },
  { id: "deepinfra/deepseek-v4-flash", label: "DeepSeek V4 Flash (Opper, $0.09/$0.18 per 1M, good)" },
  { id: "aws/nova-micro-eu", label: "Amazon Nova Micro EU (Opper, $0.035/$0.15 per 1M, good)" },
  { id: "mistral:global/ministral-3b-2512", label: "Ministral 3 3B (Opper, $0.1/$0.1 per 1M, good)" },
];

export const LLM_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    key: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nvidia/nemotron-3.5-super-vl:free",
    envKey: "OPENROUTER_API_KEY",
    models: FALLBACK_OPENROUTER_MODELS,
  },
  {
    key: "opper",
    label: "Opper",
    baseUrl: "https://api.opper.ai/v3/compat",
    defaultModel: "openai:flex/gpt-5-mini",
    envKey: "OPPER_API_KEY",
    models: FALLBACK_OPPER_MODELS,
  },
  {
    key: "openapi",
    label: "OpenAI-compatible",
    baseUrl: "",
    defaultModel: "",
    envKey: "LLM_API_KEY",
    models: [],
  },
];

const modelCaches = new Map<LLMProviderKey, { choices: ModelChoice[]; fetchedAt: number }>();
const modelFetches = new Map<LLMProviderKey, Promise<ModelChoice[]>>();

function isZeroPrice(value: string | number | undefined): boolean {
  return value === 0 || value === "0" || value === "0.0";
}

function isFreeTextModel(model: OpenRouterModel): boolean {
  const pricing = model.pricing ?? {};
  if (!isZeroPrice(pricing.prompt) || !isZeroPrice(pricing.completion)) return false;
  const architecture = model.architecture ?? {};
  const input = architecture.input_modalities ?? ["text"];
  const output = architecture.output_modalities ?? ["text"];
  return input.includes("text") && output.length === 1 && output[0] === "text";
}

function firstPrice(values: number[] | undefined): number | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return values.reduce((lowest, value) => Number.isFinite(value) ? Math.min(lowest, value) : lowest, Number.POSITIVE_INFINITY);
}

function qualityRank(quality: string | undefined): number {
  if (quality === "excellent") return 0;
  if (quality === "great") return 1;
  if (quality === "good") return 2;
  return 3;
}

function formatPrice(value: number): string {
  return String(Number(value.toFixed(3)));
}

function isLowCostOpperModel(model: OpperModel): boolean {
  const pricing = model.pricing ?? {};
  if (pricing.billing_unit && pricing.billing_unit !== "per_mtok") return false;
  const input = firstPrice(pricing.input);
  const output = firstPrice(pricing.output);
  if (input === undefined || output === undefined) return false;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return false;
  if (input < 0 || output < 0 || input > OPPER_MAX_INPUT_PER_MTOK || output > OPPER_MAX_OUTPUT_PER_MTOK) return false;
  if (qualityRank(model.quality) > 2) return false;
  const capabilities = model.capabilities ?? [];
  if (!capabilities.includes("text") || !capabilities.includes("structured_output")) return false;
  const outputModalities = model.output_modalities ?? ["text"];
  if (outputModalities.length !== 1 || outputModalities[0] !== "text") return false;
  if (/(^|[-:/])batch([-:/]|$)/i.test(model.id)) return false;
  return true;
}

function opperChoice(model: OpperModel): ModelChoice {
  const input = firstPrice(model.pricing?.input) ?? 0;
  const output = firstPrice(model.pricing?.output) ?? 0;
  return {
    id: model.id,
    label: `${model.name ?? model.id} (${model.id}, $${formatPrice(input)}/$${formatPrice(output)} per 1M)`,
  };
}

function fallbackChoices(providerKey: LLMProviderKey): ModelChoice[] {
  if (providerKey === "opper") return FALLBACK_OPPER_MODELS.map(({ id, label }) => ({ id, label }));
  return FALLBACK_OPENROUTER_MODELS.map(({ id, label }) => ({ id, label }));
}

function mergeConfigured(choices: ModelChoice[], configured: string): ModelChoice[] {
  if (!configured || choices.some((choice) => choice.id === configured)) return choices;
  return [{ id: configured, label: `Configured model (${configured})` }, ...choices];
}

export function getProviderOption(key: string | undefined): ProviderOption {
  return LLM_PROVIDER_OPTIONS.find((p) => p.key === key) ?? LLM_PROVIDER_OPTIONS[0];
}

export function resolveModel(provider: ProviderOption, requested: string | undefined): string {
  const model = (requested || "").trim();
  if (model) return model;
  return provider.defaultModel;
}

export function modelChoices(providerKey: LLMProviderKey, configured: string): ModelChoice[] {
  const provider = getProviderOption(providerKey);
  return mergeConfigured(provider.models.map(({ id, label }) => ({ id, label })), configured);
}

export function resetModelCache(): void {
  modelCaches.clear();
  modelFetches.clear();
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "spacemolt-agent-backend" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenRouterChoices(): Promise<ModelChoice[]> {
  const payload = await fetchJson(OPENROUTER_MODELS_URL) as { data?: OpenRouterModel[] };
  const fetched = (payload.data ?? [])
    .filter(isFreeTextModel)
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
    .map((model) => ({ id: model.id, label: model.name ?? model.id }));
  if (fetched.length === 0) throw new Error("no free text models returned");
  return fetched;
}

async function fetchOpperChoices(): Promise<ModelChoice[]> {
  const models: OpperModel[] = [];
  for (let page = 0; page < 5; page += 1) {
    const offset = page === 0 ? 0 : models.length;
    const url = `${OPPER_MODELS_URL}?${new URLSearchParams({ type: "llm", limit: "1000", offset: String(offset) })}`;
    const payload = await fetchJson(url) as {
      models?: OpperModel[];
      has_more?: boolean;
      next_offset?: number;
    };
    if (!Array.isArray(payload.models)) throw new Error("no models returned");
    models.push(...payload.models);
    if (!payload.has_more) break;
    const nextOffset = typeof payload.next_offset === "number" ? payload.next_offset : models.length;
    if (nextOffset <= offset) break;
    while (models.length < nextOffset) models.push({ id: `skip-${page}-${models.length}` });
  }
  const fetched = models
    .filter(isLowCostOpperModel)
    .sort((a, b) => {
      const inputA = firstPrice(a.pricing?.input) ?? 0;
      const inputB = firstPrice(b.pricing?.input) ?? 0;
      const outputA = firstPrice(a.pricing?.output) ?? 0;
      const outputB = firstPrice(b.pricing?.output) ?? 0;
      return qualityRank(a.quality) - qualityRank(b.quality)
        || inputA + outputA - inputB - outputB
        || a.id.localeCompare(b.id);
    })
    .slice(0, OPPER_CHOICE_LIMIT)
    .map(opperChoice);
  if (fetched.length === 0) throw new Error("no low-cost structured-output text models returned");
  return fetched;
}

export async function getModelChoices(
  providerKey: LLMProviderKey,
  configured: string,
): Promise<{ choices: ModelChoice[]; source: ModelSource; fetchedAt: number }> {
  const provider = getProviderOption(providerKey);
  if (provider.key === "openapi") {
    return { choices: modelChoices(providerKey, configured), source: "configured", fetchedAt: 0 };
  }

  const sourceKey: ModelSource = providerKey === "opper" ? "opper" : "openrouter";
  const now = Date.now();
  let choices = fallbackChoices(providerKey);
  let source: ModelSource = "fallback";
  let fetchedAt = 0;
  const cached = modelCaches.get(providerKey);

  if (cached && now - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    choices = cached.choices;
    source = sourceKey;
    fetchedAt = cached.fetchedAt;
  } else {
    if (!modelFetches.has(providerKey)) {
      const loader = providerKey === "opper" ? fetchOpperChoices : fetchOpenRouterChoices;
      const pending = (async () => {
        try {
          const fetched = await loader();
          modelCaches.set(providerKey, { choices: fetched, fetchedAt: Date.now() });
          return fetched;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(`${providerKey}.models_failed`, { message });
          return fallbackChoices(providerKey);
        } finally {
          modelFetches.delete(providerKey);
        }
      })();
      modelFetches.set(providerKey, pending);
    }
    const fetched = await modelFetches.get(providerKey)!;
    const refreshed = modelCaches.get(providerKey);
    if (refreshed) {
      choices = refreshed.choices;
      source = sourceKey;
      fetchedAt = refreshed.fetchedAt;
    } else {
      choices = fetched;
    }
  }

  return {
    choices: mergeConfigured(choices, configured),
    source,
    fetchedAt,
  };
}

export async function isAllowedModel(
  providerKey: LLMProviderKey,
  configured: string,
  requested: string,
): Promise<boolean> {
  if (requested === configured) return true;
  if (providerKey === "openrouter") {
    return requested.endsWith(":free") || requested === "openrouter/free";
  }
  if (providerKey === "opper") {
    if (fallbackChoices("opper").some((choice) => choice.id === requested)) return true;
    const { choices } = await getModelChoices("opper", configured);
    return choices.some((choice) => choice.id === requested);
  }
  return false;
}
