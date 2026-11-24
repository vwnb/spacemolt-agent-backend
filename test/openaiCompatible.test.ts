import { describe, expect, it } from "vitest";
import { OpenAICompatibleReasoningClient } from "../src/reasoning/openaiCompatible.js";

function clientFor(content: string) {
  const fetchImpl = (async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  })) as unknown as typeof fetch;

  return new OpenAICompatibleReasoningClient({
    baseUrl: "https://llm.example/v1",
    apiKey: "k",
    model: "m",
    timeoutMs: 1000,
    fetchImpl,
  });
}

describe("OpenAI-compatible reasoning responses", () => {
  it("accepts args that arrive as a JSON string", async () => {
    const content = JSON.stringify({
      reply: "Mining now.",
      actions: [{ action: "mine", args: "{}" }],
      done: true,
    });

    const decision = await clientFor(content).decide({ system: "s", messages: [] });

    expect(decision.actions[0].args).toEqual({});
  });

  it("accepts a decision wrapped in a JSON string", async () => {
    const inner = JSON.stringify({
      reply: "Ready.",
      actions: [{ action: "dock", args: { id: "station-1" } }],
      done: false,
    });

    const decision = await clientFor(JSON.stringify(inner)).decide({ system: "s", messages: [] });

    expect(decision.reply).toBe("Ready.");
    expect(decision.actions[0].args).toEqual({ id: "station-1" });
    expect(decision.done).toBe(false);
  });

  it("returns a clear error for unreadable responses", async () => {
    await expect(clientFor(JSON.stringify("plain text")).decide({ system: "s", messages: [] }))
      .rejects.toThrow("The reasoning model returned an unreadable response; no action was taken.");
  });
});
