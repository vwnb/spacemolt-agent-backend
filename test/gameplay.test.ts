import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("../src/spacemolt/client.js", () => ({
  SpaceMoltClient: class {
    post = postMock;
    constructor(_base: string) {}
  },
}));

describe("gameplay action registry", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("parses documented actions and rejects extra fields", async () => {
    const { parseGameAction } = await import("../src/agent/gameplay.js");

    const valid = parseGameAction({
      tool: "spacemolt_social",
      action: "chat",
      args: { target: "system", content: "Standing by." },
    });
    expect(valid.ok).toBe(true);

    const invalid = parseGameAction({
      tool: "spacemolt_social",
      action: "chat",
      args: { target: "system", content: "Standing by.", secret: true },
    });
    expect(invalid.ok).toBe(false);
  });

  it("tells the reasoning model that args must be an object and approval is backend-owned", async () => {
    const { GAMEPLAY_SYSTEM_PROMPT } = await import("../src/agent/gameplay.js");
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("args must be a JSON object");
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("omit approval from your output");
  });

  it("accepts an approval marker from a model action without trusting it", async () => {
    const { parseGameAction, requiresApproval } = await import("../src/agent/gameplay.js");

    const safe = parseGameAction({ tool: "spacemolt", action: "get_status", args: {}, approval: true });
    const write = parseGameAction({ tool: "spacemolt_social", action: "chat", args: { target: "local", content: "hi" }, approval: false });

    expect(safe.ok).toBe(true);
    expect(write.ok).toBe(true);
    if (safe.ok) expect(requiresApproval(safe.action)).toBe(false);
    if (write.ok) expect(requiresApproval(write.action)).toBe(true);
  });

  it("drops guessed args from no-argument actions", async () => {
    const { parseGameAction } = await import("../src/agent/gameplay.js");

    const parsed = parseGameAction({
      tool: "spacemolt",
      action: "get_system",
      args: { system_id: "sol" },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.action.args).toEqual({});
  });

  it("marks write actions and cargo scans as approval-gated", async () => {
    const { requiresApproval } = await import("../src/agent/gameplay.js");

    expect(requiresApproval({
      tool: "spacemolt_social",
      action: "chat",
      args: { target: "system", content: "Standing by." },
    })).toBe(true);
    expect(requiresApproval({
      tool: "spacemolt",
      action: "scan",
      args: { id: "pilot-1", mode: "cargo" },
    })).toBe(true);
    expect(requiresApproval({
      tool: "spacemolt",
      action: "scan",
      args: { id: "poi-1" },
    })).toBe(false);
    expect(requiresApproval({
      tool: "spacemolt",
      action: "craft",
      args: { id: "fuel_cell", dry_run: true },
    })).toBe(false);
  });

  it("executes only approved actions through the pilot session", async () => {
    const { SpaceMoltClient } = await import("../src/spacemolt/client.js");
    const { executeApprovedActions } = await import("../src/agent/gameplay.js");
    const client = new SpaceMoltClient("https://game.example") as any;
    postMock
      .mockResolvedValueOnce({ structuredContent: { hostile: true } })
      .mockResolvedValueOnce({ structuredContent: { hunted: true } });

    const results = await executeApprovedActions(client, "s1", [
      { tool: "spacemolt", action: "attack", args: { id: "pirate-1" } },
      { tool: "spacemolt", action: "get_status", args: {} },
      { tool: "spacemolt", action: "hunt", args: { id: "species-1" } },
    ]);

    expect(results.map((result) => result.ok)).toEqual([true, false, true]);
    expect(results[1].error).toBe("Action does not require approval");
    expect(postMock.mock.calls).toEqual([
      ["spacemolt", "attack", { id: "pirate-1" }, "s1"],
      ["spacemolt", "hunt", { id: "species-1" }, "s1"],
    ]);
  });
});
