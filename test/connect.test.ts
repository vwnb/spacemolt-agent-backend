import { beforeEach, describe, expect, it, vi } from "vitest";

const createSessionMock = vi.fn();
const postMock = vi.fn();
const proposeMock = vi.fn();

vi.mock("../src/spacemolt/client.js", () => ({
  SpaceMoltClient: class {
    createSession = createSessionMock;
    post = postMock;
    constructor(_base: string) {}
  },
}));
vi.mock("../src/reasoning/openaiCompatible.js", () => ({
  OpenAICompatibleReasoningClient: class {
    propose = proposeMock;
    constructor(_opts: any) {}
  },
}));

process.env.LLM_BASE_URL = "https://llm.example/v1";
process.env.LLM_API_KEY = "k";
process.env.LLM_MODEL = "m";

describe("connectAndObserve", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    postMock.mockReset();
    proposeMock.mockReset();
    createSessionMock.mockResolvedValue({ session: { id: "s1" } });
    proposeMock.mockResolvedValue({
      summary: "Observe only",
      should_act: false,
      proposed_action: null,
      confidence: 0.5,
      risks: [],
    });
  });

  it("registers with a registration code and returns the one-time password", async () => {
    postMock
      .mockResolvedValueOnce({
        structuredContent: {
          message: "Welcome",
          password: "generated-password",
          username: "new_pilot",
          player_id: "p1",
        },
      })
      .mockResolvedValueOnce({ structuredContent: { credits: 1 }, result: "ok" })
      .mockResolvedValueOnce({ structuredContent: [{ type: "chat" }], result: "n" });

    const { connectAndObserve } = await import("../src/agent/connect.js");
    const result = await connectAndObserve({
      mode: "register",
      username: "new_pilot",
      empire: "solarian",
      registrationCode: "code-123",
    });

    expect(result.ok).toBe(true);
    expect(result.account).toMatchObject({
      username: "new_pilot",
      playerId: "p1",
      password: "generated-password",
    });
    expect(result.auth.message).toBe("Welcome");
    expect(postMock.mock.calls[0]).toEqual([
      "spacemolt_auth",
      "register",
      { username: "new_pilot", empire: "solarian", registration_code: "code-123" },
      "s1",
    ]);
    expect(postMock.mock.calls.map((call) => call[1])).toEqual([
      "register",
      "get_status",
      "get_notifications",
    ]);
  });
});
