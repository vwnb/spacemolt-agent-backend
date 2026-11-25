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

  it("exposes map and system search as safe read actions", async () => {
    const { parseGameAction, requiresApproval, GAMEPLAY_SYSTEM_PROMPT } = await import("../src/agent/gameplay.js");

    const map = parseGameAction({ tool: "spacemolt", action: "get_map", args: { system_id: "sol" } });
    const search = parseGameAction({ tool: "spacemolt", action: "search_systems", args: { text: "Tau" } });
    expect(map.ok).toBe(true);
    expect(search.ok).toBe(true);
    if (map.ok) expect(requiresApproval(map.action)).toBe(false);
    if (search.ok) expect(requiresApproval(search.action)).toBe(false);

    expect(parseGameAction({ tool: "spacemolt", action: "search_systems", args: { id: "Tau" } }).ok).toBe(false);
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain('"action":"get_map"');
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain('"action":"search_systems"');
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("search_systems with args.text");
  });

  it("supports self-service refuel and repair and gates player targets", async () => {
    const { parseGameAction, requiresApproval, GAMEPLAY_SYSTEM_PROMPT } = await import("../src/agent/gameplay.js");

    const selfRefuel = parseGameAction({ tool: "spacemolt", action: "refuel", args: {} });
    const cargoRefuel = parseGameAction({ tool: "spacemolt", action: "refuel", args: { id: "fuel_cell", quantity: 2 } });
    const fleetRefuel = parseGameAction({ tool: "spacemolt", action: "refuel", args: { target: "fleet" } });
    const playerRefuel = parseGameAction({ tool: "spacemolt", action: "refuel", args: { target: "PilotName" } });
    const selfRepair = parseGameAction({ tool: "spacemolt", action: "repair", args: {} });
    const playerRepair = parseGameAction({ tool: "spacemolt", action: "repair", args: { target: "PilotName" } });

    for (const parsed of [selfRefuel, cargoRefuel, fleetRefuel, playerRefuel, selfRepair, playerRepair]) {
      expect(parsed.ok).toBe(true);
    }
    if (selfRefuel.ok) expect(requiresApproval(selfRefuel.action)).toBe(false);
    if (cargoRefuel.ok) expect(requiresApproval(cargoRefuel.action)).toBe(false);
    if (fleetRefuel.ok) expect(requiresApproval(fleetRefuel.action)).toBe(false);
    if (playerRefuel.ok) expect(requiresApproval(playerRefuel.action)).toBe(true);
    if (selfRepair.ok) expect(requiresApproval(selfRepair.action)).toBe(false);
    if (playerRepair.ok) expect(requiresApproval(playerRepair.action)).toBe(true);

    expect(parseGameAction({ tool: "spacemolt", action: "refuel", args: { quantity: 0 } }).ok).toBe(false);
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("To refuel or repair yourself, omit target");
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("refuel/repair transfers to other pilots require approval");
  });

  it("documents station-to-cargo transfers as storage withdraw", async () => {
    const { ACTION_SPECS, parseGameAction, GAMEPLAY_SYSTEM_PROMPT } = await import("../src/agent/gameplay.js");

    const withdraw = parseGameAction({
      tool: "spacemolt_storage",
      action: "withdraw",
      args: { item_id: "iron_ore", quantity: 10 },
    });
    expect(withdraw.ok).toBe(true);
    expect(ACTION_SPECS["spacemolt_storage/withdraw"].use).toContain("station storage into cargo");
    expect(ACTION_SPECS["spacemolt_storage/deposit"].use).toContain("cargo into station storage");
    expect(GAMEPLAY_SYSTEM_PROMPT).toContain("there is no separate transfer-to-cargo action");
  });

  it("routes chat sent with the default tool to the social tool", async () => {
    const { parseGameAction, requiresApproval } = await import("../src/agent/gameplay.js");

    const parsed = parseGameAction({
      tool: "spacemolt",
      action: "chat",
      args: { target: "system", content: "Standing by." },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.action.tool).toBe("spacemolt_social");
      expect(parsed.action.action).toBe("chat");
      expect(requiresApproval(parsed.action)).toBe(true);
    }
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

  it("normalizes a find_route response into followable steps", async () => {
    const { parseRoutePlan } = await import("../src/agent/gameplay.js");

    const plan = parseRoutePlan({
      found: true,
      route: [
        { system_id: "sol", name: "Sol", jumps: 0 },
        { system_id: "alpha", name: "Alpha Centauri", jumps: 1 },
        { system_id: "tau", name: "Tau Ceti", jumps: 2 },
      ],
      total_jumps: 2,
      target_system: "tau",
      target_poi: "tau_belt",
      target_poi_name: "Tau Ceti Belt",
      message: "Route found.",
      estimated_fuel: 12,
      fuel_available: 85,
    }, "tau_belt");

    expect(plan).toEqual({
      destination: "tau_belt",
      steps: [
        { systemId: "alpha", name: "Alpha Centauri", jumps: 1 },
        { systemId: "tau", name: "Tau Ceti", jumps: 2 },
        { systemId: "tau_belt", name: "Tau Ceti Belt", jumps: 2, kind: "travel" },
      ],
      totalJumps: 2,
      targetSystem: "tau",
      targetPoi: "tau_belt",
      targetPoiName: "Tau Ceti Belt",
      message: "Route found.",
      estimatedFuel: 12,
      fuelAvailable: 85,
    });
  });

  it("extracts active missions without available mission noise", async () => {
    const { activeMissionsText } = await import("../src/agent/gameplay.js");

    const text = activeMissionsText({
      missions: {
        active: [{ id: "m1", objective: "Deliver ore" }],
        available: [{ id: "n1", objective: "Hunt pirates" }],
      },
    });

    expect(text).toContain("m1");
    expect(text).toContain("Deliver ore");
    expect(text).not.toContain("n1");
    expect(activeMissionsText({ missions: { active: [], available: [{ id: "n1" }] } })).toBeUndefined();
    expect(activeMissionsText({ active_missions: [{ id: "m2" }] })).toContain("m2");
  });

  it("keeps the structured payload on executed actions", async () => {
    const { SpaceMoltClient } = await import("../src/spacemolt/client.js");
    const { executeGameAction } = await import("../src/agent/gameplay.js");
    const client = new SpaceMoltClient("https://game.example") as any;
    postMock.mockResolvedValueOnce({ structuredContent: { found: true, route: [] } });

    const result = await executeGameAction(client, "s1", { action: "find_route", args: { id: "tau" } });

    expect(result.ok).toBe(true);
    expect(result.structured).toEqual({ found: true, route: [] });
  });
});
