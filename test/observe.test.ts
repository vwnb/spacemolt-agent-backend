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

describe("observeWithToken", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    postMock.mockReset();
    proposeMock.mockReset();
  });

  it("redeems the token once and observes without using a password", async () => {
    createSessionMock.mockResolvedValueOnce({ session: { id: "s1" } });
    postMock
      .mockResolvedValueOnce({ structuredContent: { logged_in: true } })
      .mockResolvedValueOnce({ structuredContent: { player: { credits: 1 } }, result: "ok" })
      .mockResolvedValueOnce({ structuredContent: [{ type: "chat" }], result: "n" });
    proposeMock.mockResolvedValueOnce({
      summary: "Observe only",
      should_act: false,
      proposed_action: null,
      confidence: 0.5,
      risks: [],
    });

    const { observeWithToken } = await import("../src/agent/observe.js");
    const result = await observeWithToken("single-use-token");

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("observe_propose_only");
    expect(result.observed.notificationCount).toBe(1);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith("spacemolt_auth", "login_token", { token: "single-use-token" }, "s1");
    expect(postMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(postMock.mock.calls)).not.toContain("password");
  });

  it("keeps a valid observation when the reasoning model times out", async () => {
    createSessionMock.mockResolvedValueOnce({ session: { id: "s1" } });
    postMock
      .mockResolvedValueOnce({ structuredContent: { logged_in: true } })
      .mockResolvedValueOnce({ structuredContent: { player: { credits: 1 } }, result: "ok" })
      .mockResolvedValueOnce({ structuredContent: [], result: "n" });
    proposeMock.mockRejectedValueOnce(new Error("This operation was aborted"));

    const { observeWithToken } = await import("../src/agent/observe.js");
    const result = await observeWithToken("single-use-token");

    expect(result.ok).toBe(true);
    expect(result.observed.hasStatus).toBe(true);
    expect(result.proposal).toBeNull();
    expect(result.reasoning_error).toBe("This operation was aborted");
    expect(postMock).toHaveBeenCalledTimes(3);
  });

  it("rejects an invalid token as InvalidTokenError", async () => {
    const { SpaceMoltApiError } = await import("../src/spacemolt/types.js");
    createSessionMock.mockResolvedValueOnce({ session: { id: "s1" } });
    postMock.mockRejectedValueOnce(new SpaceMoltApiError("Invalid or expired login token", 401, "auth_failed"));

    const { InvalidTokenError, observeWithToken } = await import("../src/agent/observe.js");
    await expect(observeWithToken("bad-token")).rejects.toBeInstanceOf(InvalidTokenError);
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
