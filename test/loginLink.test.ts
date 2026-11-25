import { beforeEach, describe, expect, it, vi } from "vitest";

const createSessionMock = vi.fn();
const postMock = vi.fn();
const proposeMock = vi.fn();
const reasoningOptsMock = vi.fn();

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
    constructor(opts: any) {
      reasoningOptsMock(opts);
    }
  },
}));

process.env.LLM_BASE_URL = "https://llm.example/v1";
process.env.LLM_API_KEY = "k";
process.env.LLM_MODEL = "m";

describe("loginLink", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    postMock.mockReset();
    proposeMock.mockReset();
    reasoningOptsMock.mockReset();
    proposeMock.mockResolvedValue({
      summary: "Observe only",
      should_act: false,
      proposed_action: null,
      confidence: 0.5,
      risks: [],
    });
  });

  it("starts a browser login link on a fresh SpaceMolt session", async () => {
    createSessionMock.mockResolvedValueOnce({ session: { id: "link-session" } });
    postMock.mockResolvedValueOnce({
      structuredContent: {
        device_code: "device-1",
        user_code: "ABCD",
        verification_uri: "https://game.spacemolt.com/login",
        verification_uri_complete: "https://game.spacemolt.com/login?code=ABCD",
        instructions: "Sign in and approve this pilot",
        interval: 5,
        expires_in: 600,
      },
    });

    const { startLoginLink } = await import("../src/agent/loginLink.js");
    const result = await startLoginLink();

    expect(result).toMatchObject({
      linkSessionId: "link-session",
      deviceCode: "device-1",
      userCode: "ABCD",
      interval: 5,
      expiresIn: 600,
    });
    expect(postMock.mock.calls[0]).toEqual(["spacemolt_auth", "login_link", {}, "link-session"]);
  });

  it("reports a pending poll without observing", async () => {
    postMock.mockResolvedValueOnce({
      structuredContent: { status: "authorization_pending", interval: 4 },
    });

    const { pollLoginLink } = await import("../src/agent/loginLink.js");
    const result = await pollLoginLink("link-session", "device-1");

    expect(result).toEqual({ complete: false, status: "authorization_pending", interval: 4 });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("observes the approved pilot on the same session", async () => {
    postMock
      .mockResolvedValueOnce({ structuredContent: { username: "pilot", player_id: "p1" } })
      .mockResolvedValueOnce({ structuredContent: { credits: 3 }, result: "ok" })
      .mockResolvedValueOnce({ structuredContent: [{ type: "chat" }], result: "n" });

    const { pollLoginLink } = await import("../src/agent/loginLink.js");
    const result = await pollLoginLink("link-session", "device-1", {
      provider: "openrouter",
      model: "saved:free",
    });

    expect(result.complete).toBe(true);
    if (!result.complete) return;
    expect(result.ok).toBe(true);
    expect(result.auth.mode).toBe("login_link");
    expect(result.account).toMatchObject({ username: "pilot", playerId: "p1" });
    expect(result.sessionId).toBe("link-session");
    expect(postMock.mock.calls.map((call) => call[1])).toEqual([
      "login_link_poll",
      "get_status",
      "get_notifications",
    ]);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(reasoningOptsMock).toHaveBeenCalledWith(expect.objectContaining({ model: "saved:free" }));
  });
});
