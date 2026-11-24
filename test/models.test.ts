import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getModelChoices,
  isAllowedModel,
  modelChoices,
  resetModelCache,
} from "../src/reasoning/models.js";

const freeText = {
  id: "example/new-free:free",
  name: "Example: New Free",
  created: 200,
  pricing: { prompt: "0", completion: "0" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
};

const freeAudio = {
  id: "example/audio-free",
  name: "Example: Audio Free",
  created: 300,
  pricing: { prompt: 0, completion: 0 },
  architecture: { input_modalities: ["text"], output_modalities: ["text", "audio"] },
};

const paid = {
  id: "example/paid",
  name: "Example: Paid",
  created: 400,
  pricing: { prompt: "0.001", completion: "0.002" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
};

const opperLowCost = {
  id: "example/low-cost",
  name: "Example Low Cost",
  type: "llm",
  quality: "good",
  capabilities: ["text", "tools", "structured_output"],
  output_modalities: ["text"],
  pricing: { billing_unit: "per_mtok", input: [0.05], output: [0.2] },
};

const opperBatch = {
  ...opperLowCost,
  id: "example-batch/low-cost-batch",
};

const opperExpensive = {
  ...opperLowCost,
  id: "example/expensive",
  quality: "excellent",
  pricing: { billing_unit: "per_mtok", input: [10], output: [30] },
};

describe("model choices", () => {
  beforeEach(() => {
    resetModelCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes fallback openrouter models and the configured model", () => {
    const choices = modelChoices("openrouter", "custom/model");
    expect(choices.some((choice) => choice.id === "baidu/ernie-5.5-flash-preview:free")).toBe(true);
    expect(choices.some((choice) => choice.id === "custom/model")).toBe(true);
  });

  it("includes curated low-cost Opper models", () => {
    const choices = modelChoices("opper", "custom/model");
    expect(choices.some((choice) => choice.id === "openai:flex/gpt-5-mini")).toBe(true);
    expect(choices.some((choice) => choice.id === "custom/model")).toBe(true);
  });

  it("accepts the configured model and any OpenRouter free model ID", async () => {
    expect(await isAllowedModel("openrouter", "m", "m")).toBe(true);
    expect(await isAllowedModel("openrouter", "m", "example/new-free:free")).toBe(true);
    expect(await isAllowedModel("openrouter", "m", "openrouter/free")).toBe(true);
    expect(await isAllowedModel("openrouter", "m", "example/paid")).toBe(false);
  });

  it("accepts curated and fetched low-cost Opper models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [opperExpensive, opperBatch, opperLowCost], has_more: false }),
    }));

    expect(await isAllowedModel("opper", "configured/model", "openai:flex/gpt-5-nano")).toBe(true);
    expect(await isAllowedModel("opper", "configured/model", "example/low-cost")).toBe(true);
    expect(await isAllowedModel("opper", "configured/model", "example/expensive")).toBe(false);
  });

  it("fetches all free text models from OpenRouter and caches them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [paid, freeAudio, freeText] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getModelChoices("openrouter", "configured/model");
    const second = await getModelChoices("openrouter", "configured/model");

    expect(first.source).toBe("openrouter");
    expect(first.choices.map((choice) => choice.id)).toEqual([
      "configured/model",
      "example/new-free:free",
    ]);
    expect(second.choices).toEqual(first.choices);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
  });

  it("fetches low-cost structured-output text models from Opper and caches them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [opperExpensive, opperBatch, opperLowCost], has_more: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getModelChoices("opper", "configured/model");
    const second = await getModelChoices("opper", "configured/model");

    expect(first.source).toBe("opper");
    expect(first.choices.map((choice) => choice.id)).toEqual(["configured/model", "example/low-cost"]);
    expect(second.choices).toEqual(first.choices);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.opper.ai/v3/models?");
  });

  it("falls back when OpenRouter is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await getModelChoices("openrouter", "");

    expect(result.source).toBe("fallback");
    expect(result.choices.some((choice) => choice.id === "openrouter/free")).toBe(true);
  });

  it("falls back when Opper is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await getModelChoices("opper", "");

    expect(result.source).toBe("fallback");
    expect(result.choices.some((choice) => choice.id === "openai:flex/gpt-5-mini")).toBe(true);
  });
});
