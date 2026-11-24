import { z } from "zod";

export const proposalSchema = z.object({
  summary: z.string().min(1),
  should_act: z.boolean(),
  proposed_action: z
    .object({
      tool: z.string().min(1),
      action: z.string().min(1),
      payload: z.record(z.unknown()).default({}),
      reason: z.string().min(1),
    })
    .nullable(),
  confidence: z.number().min(0).max(1),
  risks: z.array(z.string()).default([]),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const agentDecisionSchema = z.object({
  reply: z.string().min(1),
  actions: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        tool: z.string().min(1).optional(),
        action: z.string().min(1),
        args: z.record(z.unknown()).default({}),
        reason: z.string().max(500).optional(),
      }),
    )
    .max(4)
    .default([]),
  done: z.boolean().default(true),
});

export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export interface ReasoningInput {
  observation: unknown;
}

export interface AgentInput {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface ReasoningClient {
  propose(input: ReasoningInput): Promise<Proposal>;
  decide(input: AgentInput): Promise<AgentDecision>;
}
