import { getConfig, resolveProviderRuntime } from "../config/env.js";
import { log } from "../logger.js";
import { OpenAICompatibleReasoningClient } from "../reasoning/openaiCompatible.js";
import { isAllowedModel, type LLMProviderKey } from "../reasoning/models.js";
import type { AgentDecision } from "../reasoning/types.js";
import { SpaceMoltClient } from "../spacemolt/client.js";
import {
  compact,
  executeGameAction,
  GAMEPLAY_SYSTEM_PROMPT,
  invalidGameActionRecord,
  parseGameAction,
  parseRoutePlan,
  requiresApproval,
  type GameActionRecord,
  type PendingAction,
  type RoutePlan,
} from "./gameplay.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatInput = {
  sessionId: string;
  message: string;
  objective?: string;
  provider?: LLMProviderKey;
  model?: string;
  history: ChatMessage[];
};

export type PendingActionRecord = PendingAction & { approval: true };

const FOLLOWUP_SYSTEM_PROMPT = [
  "You are writing the pilot-facing follow-up after SpaceMolt actions already ran.",
  "Use the tool results as ground truth. If an action failed, say it failed and why; never claim success.",
  "Return strict JSON with reply(string), actions([]), done(true). Do not propose or execute more actions.",
  "Keep it short and concrete: what changed, what failed, and the next concrete step.",
].join(" ");

export type ChatResult = {
  ok: boolean;
  reply: string;
  actions: GameActionRecord[];
  pending_actions: PendingActionRecord[];
  routes: RoutePlan[];
  context: { hasStatus: boolean; hasSkills: boolean; pilot?: string };
  error?: string;
};

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pilotFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const content = value as Record<string, unknown>;
  const player = content.player && typeof content.player === "object"
    ? content.player as Record<string, unknown>
    : {};
  return textField(player.username) ?? textField(content.username) ?? textField(player.id) ?? textField(content.player_id);
}

export async function chatWithAgent(input: ChatInput): Promise<ChatResult> {
  const cfg = getConfig();
  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);

  let hasStatus = false;
  let hasSkills = false;
  let pilot: string | undefined;
  let stateText = "Game state unavailable.";
  let skillsText = "In-game skills unavailable.";
  try {
    const status = await client.post("spacemolt", "get_status", {}, input.sessionId);
    const content = status.structuredContent ?? status.result ?? status;
    hasStatus = true;
    pilot = pilotFrom(status.structuredContent);
    stateText = `Server-provided game state:\n${compact(content)}`;
    const skills = content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>).skills
      : undefined;
    if (skills !== undefined && skills !== null) {
      hasSkills = true;
      skillsText = `Server-provided in-game skills:\n${compact(skills)}`;
    }
  } catch (err) {
    stateText = `Game state unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }

  const objective = input.objective?.trim();
  const objectiveText = objective
    ? `Pilot's personal objective (set in the UI): ${objective}`
    : "Pilot's personal objective: none set.";

  const providerKey = input.provider ?? cfg.llmProvider;
  const runtime = resolveProviderRuntime(cfg, providerKey);
  const model = input.model && await isAllowedModel(providerKey, runtime.model, input.model)
    ? input.model
    : runtime.model;
  const reasoning = new OpenAICompatibleReasoningClient({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    model,
    timeoutMs: runtime.timeoutMs,
    extraHeaders: runtime.extraHeaders,
  });

  let decision: AgentDecision;
  try {
    decision = await reasoning.decide({
      system: GAMEPLAY_SYSTEM_PROMPT,
      messages: [
        ...input.history.slice(-12),
        { role: "user", content: objectiveText },
        { role: "user", content: stateText },
        { role: "user", content: skillsText },
        { role: "user", content: input.message },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("chat.decision_failed", { message });
    return {
      ok: false,
      reply: "I could not reach the reasoning model, so I did not take any game action.",
      actions: [],
      pending_actions: [],
      routes: [],
      context: { hasStatus, hasSkills, pilot },
      error: message,
    };
  }

  const actions: GameActionRecord[] = [];
  const pending_actions: PendingActionRecord[] = [];
  for (const [index, raw] of decision.actions.slice(0, 4).entries()) {
    const parsed = parseGameAction(raw);
    if (!parsed.ok) {
      actions.push(invalidGameActionRecord(raw, parsed.error));
      continue;
    }
    if (requiresApproval(parsed.action)) {
      pending_actions.push({
        ...parsed.action,
        id: parsed.action.id ?? `p-${Date.now().toString(36)}-${index + 1}`,
        approval: true,
      });
      continue;
    }
    actions.push(await executeGameAction(client, input.sessionId, parsed.action));
  }

  const routes: RoutePlan[] = [];
  for (const action of actions) {
    if (action.tool !== "spacemolt" || action.action !== "find_route" || !action.ok) continue;
    const destination = typeof action.args.id === "string" ? action.args.id : "";
    const plan = parseRoutePlan(action.structured, destination);
    if (plan) routes.push(plan);
  }

  let reply = decision.reply;
  if (actions.length > 0 || pending_actions.length > 0 || routes.length > 0) {
    try {
      const followUp = await reasoning.decide({
        system: FOLLOWUP_SYSTEM_PROMPT,
        messages: [
          ...input.history.slice(-12),
          { role: "user", content: objectiveText },
          { role: "user", content: `Pilot request: ${input.message}` },
          { role: "assistant", content: decision.reply },
          {
            role: "user",
            content: `SpaceMolt results:\n${compact({
              actions: actions.map((action) => ({
                tool: action.tool,
                action: action.action,
                args: action.args,
                ok: action.ok,
                result: action.result,
                error: action.error,
              })),
              pending_actions,
              routes,
            }, 12000)}\nWrite the follow-up now.`,
          },
        ],
      });
      reply = followUp.reply;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("chat.follow_up_failed", { message });
    }
  }

  const failed = actions.filter((action) => !action.ok);
  return {
    ok: true,
    reply,
    actions,
    pending_actions,
    routes,
    context: { hasStatus, hasSkills, pilot },
    error: failed.length > 0 ? `${failed.length} action(s) failed. See action results.` : undefined,
  };
}
