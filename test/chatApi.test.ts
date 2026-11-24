import { beforeEach, describe, expect, it, vi } from "vitest";

const chatMock = vi.fn();

vi.mock("../src/agent/chat.js", () => ({ chatWithAgent: chatMock }));
vi.mock("../src/agent/connect.js", () => ({
  connectFailureMessage: (err: Error) => ({ message: err.message, status: 500 }),
}));
vi.mock("../src/config/env.js", () => ({
  getConfig: () => ({ ALLOWED_ORIGIN: "*", llmProvider: "openrouter" }),
  ProviderConfigError: class ProviderConfigError extends Error {},
  resolveProviderRuntime: () => ({
    model: "m",
    baseUrl: "https://llm.example/v1",
    apiKey: "k",
    timeoutMs: 1000,
    extraHeaders: {},
  }),
}));
vi.mock("../src/http/cors.js", () => ({ corsHeaders: () => ({}) }));
vi.mock("../src/reasoning/models.js", () => ({ isAllowedModel: () => true }));

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    setHeader: vi.fn(),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(value: unknown) {
      res.body = value;
      return res;
    },
  };
  return res;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    chatMock.mockReset();
    chatMock.mockResolvedValue({ ok: true, reply: "ok", actions: [], pending_actions: [], context: {} });
  });

  it("drops older history instead of rejecting a long conversation", async () => {
    const handler = (await import("../api/chat.js")).default;
    const history = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    }));
    const req: any = {
      method: "POST",
      headers: {},
      body: { sessionId: "s1", message: "hello", history },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(chatMock.mock.calls[0][0].history).toHaveLength(20);
    expect(chatMock.mock.calls[0][0].history[0].content).toBe("m5");
  });
});
