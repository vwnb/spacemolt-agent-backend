import { describe, expect, it } from "vitest";
import { proposalSchema } from "../src/reasoning/types.js";

describe("proposalSchema", () => {
  it("accepts valid observe/propose output", () => {
    const parsed = proposalSchema.parse({
      summary: "Low fuel, docked at station.",
      should_act: true,
      proposed_action: { tool: "spacemolt", action: "refuel", payload: {}, reason: "Refuel before undocking" },
      confidence: 0.8,
      risks: ["May cost credits"],
    });
    expect(parsed.proposed_action?.action).toBe("refuel");
  });

  it("rejects missing required fields", () => {
    expect(() => proposalSchema.parse({ summary: "x" })).toThrow();
  });
});
