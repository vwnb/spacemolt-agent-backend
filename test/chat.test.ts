import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();
const decideMock = vi.fn();
const reasoningOptsMock = vi.fn();

vi.mock("../src/spacemolt/client.js", () => ({
  SpaceMoltClient: class {
    post = postMock;
    constructor(_base: string) {}
  },
}));
vi.mock("../src/reasoning/openaiCompatible.js", () => ({
  OpenAICompatibleReasoningClient: class {
    decide = decideMock;
    constructor(opts: any) {
      reasoningOptsMock(opts);
    }
  },
}));

process.env.LLM_BASE_URL = "https://llm.example/v1";
process.env.LLM_API_KEY = "k";
process.env.LLM_MODEL = "m";

describe("chatWithAgent", () => {
  beforeEach(() => {
    postMock.mockReset();
    decideMock.mockReset();
    decideMock.mockResolvedValue({ reply: "Action results reviewed.", actions: [], done: true });
    reasoningOptsMock.mockReset();
  });

  it("plays whitelisted actions through the pilot session", async () => {
    decideMock.mockResolvedValueOnce({
      reply: "Heading to the belt and mining.",
      actions: [
        { action: "travel", args: { id: "poi-belt" } },
        { action: "mine", args: {} },
      ],
      done: true,
    });
    postMock
      .mockResolvedValueOnce({ structuredContent: { player: { username: "Eunseo Moon" }, credits: 10 } })
      .mockResolvedValueOnce({ structuredContent: { arrived: true } })
      .mockResolvedValueOnce({ structuredContent: { mined: ["iron_ore"] } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "mine some ore",
      history: [],
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toBe("Action results reviewed.");
    expect(result.context.pilot).toBe("Eunseo Moon");
    expect(result.actions.map((action) => action.ok)).toEqual([true, true]);
    expect(postMock.mock.calls).toEqual([
      ["spacemolt", "get_status", {}, "s1"],
      ["spacemolt", "travel", { id: "poi-belt" }, "s1"],
      ["spacemolt", "mine", {}, "s1"],
    ]);
  });

  it("does not take actions when the reasoning model fails", async () => {
    decideMock.mockRejectedValueOnce(new Error("LLM timeout"));
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "status",
      history: [],
    });

    expect(result.ok).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.error).toBe("LLM timeout");
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("rejects undocumented action args before calling SpaceMolt", async () => {
    decideMock.mockResolvedValueOnce({
      reply: "Docking now.",
      actions: [{ action: "travel", args: { id: "poi-belt", secret: true } }],
      done: true,
    });
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "dock",
      history: [],
    });

    expect(result.actions[0].ok).toBe(false);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][1]).toBe("get_status");
  });

  it("passes documented optional args through unchanged", async () => {
    decideMock.mockResolvedValueOnce({
      reply: "Buying into storage.",
      actions: [{ action: "buy", args: { id: "iron_ore", quantity: 10, deliver_to: "storage" } }],
      done: true,
    });
    postMock
      .mockResolvedValueOnce({ structuredContent: { credits: 1 } })
      .mockResolvedValueOnce({ structuredContent: { bought: 10 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "buy iron",
      history: [],
    });

    expect(result.actions[0].ok).toBe(true);
    expect(postMock.mock.calls[1]).toEqual([
      "spacemolt",
      "buy",
      { id: "iron_ore", quantity: 10, deliver_to: "storage" },
      "s1",
    ]);
  });

  it("uses an explicitly selected documented model", async () => {
    decideMock.mockResolvedValueOnce({ reply: "Ready.", actions: [], done: true });
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    await chatWithAgent({
      sessionId: "s1",
      message: "status",
      model: "baidu/ernie-5.5-flash-preview:free",
      history: [],
    });

    expect(reasoningOptsMock).toHaveBeenCalledWith(expect.objectContaining({
      model: "baidu/ernie-5.5-flash-preview:free",
    }));
  });

  it("passes the pilot's personal objective into the reasoning context", async () => {
    decideMock.mockResolvedValueOnce({ reply: "Ready.", actions: [], done: true });
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    await chatWithAgent({
      sessionId: "s1",
      message: "status",
      objective: "Finish the courier chain",
      history: [],
    });

    const opts = decideMock.mock.calls[0][0];
    expect(opts.system).toContain("personal objective");
    expect(opts.messages).toContainEqual({
      role: "user",
      content: "Pilot's personal objective (set in the UI): Finish the courier chain",
    });
  });

  it("proposes combat actions instead of executing them", async () => {
    decideMock.mockResolvedValueOnce({
      reply: "I can attack that pirate once you approve it.",
      actions: [{ action: "attack", args: { id: "pirate-1" }, reason: "Hostile target" }],
      done: true,
    });
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "attack that pirate",
      history: [],
    });

    expect(result.actions).toEqual([]);
    expect(result.pending_actions).toHaveLength(1);
    expect(result.pending_actions[0]).toMatchObject({
      tool: "spacemolt",
      action: "attack",
      args: { id: "pirate-1" },
      reason: "Hostile target",
      approval: true,
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][1]).toBe("get_status");
  });

  it("proposes exact chat content without sending it", async () => {
    const content = "System check: we are standing by for rescue requests.";
    decideMock.mockResolvedValueOnce({
      reply: "Here is the exact broadcast draft.",
      actions: [{ tool: "spacemolt_social", action: "chat", args: { target: "system", content } }],
      done: true,
    });
    postMock.mockResolvedValueOnce({ structuredContent: { credits: 1 } });

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "announce that we are ready",
      history: [],
    });

    expect(result.actions).toEqual([]);
    expect(result.pending_actions[0].args).toEqual({ target: "system", content });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("follows up with the failed get_system result instead of stopping at the preamble", async () => {
    decideMock
      .mockResolvedValueOnce({
        reply: "Pulling up the system chart now.",
        actions: [{ action: "get_system", args: {} }],
        done: true,
      })
      .mockResolvedValueOnce({
        reply: "get_system failed: session expired. Reconnect, then I can read the chart.",
        actions: [],
        done: true,
      });
    postMock
      .mockResolvedValueOnce({ structuredContent: { credits: 1 } })
      .mockRejectedValueOnce(new Error("session expired"));

    const { chatWithAgent } = await import("../src/agent/chat.js");
    const result = await chatWithAgent({
      sessionId: "s1",
      message: "show me the system chart",
      history: [],
    });

    expect(result.reply).toBe("get_system failed: session expired. Reconnect, then I can read the chart.");
    expect(result.actions[0].ok).toBe(false);
    expect(decideMock).toHaveBeenCalledTimes(2);
    const followUpMessages = decideMock.mock.calls[1][0].messages;
    expect(followUpMessages.some((message: any) => String(message.content).includes("get_system"))).toBe(true);
  });
});
