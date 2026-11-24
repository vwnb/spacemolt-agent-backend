import { log } from "../logger.js";
import {
  agentDecisionSchema,
  proposalSchema,
  type AgentDecision,
  type AgentInput,
  type Proposal,
  type ReasoningClient,
  type ReasoningInput,
} from "./types.js";

export interface OpenAICompatibleReasoningOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const UNREADABLE_REPLY = "The reasoning model returned an unreadable response; no action was taken.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeJsonStrings(value: unknown, depth = 0): unknown {
  if (depth >= 3 || typeof value !== "string") return value;
  const text = value.trim();
  if (text.length < 2 || text.length > 20000) return value;
  if (!((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]")))) return value;
  try {
    const decoded = JSON.parse(text);
    return decoded === value ? value : decodeJsonStrings(decoded, depth + 1);
  } catch {
    return value;
  }
}

function stringifyUnknown(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return undefined;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function normalizeAction(raw: unknown): unknown {
  const decoded = decodeJsonStrings(raw);
  if (!isRecord(decoded)) return decoded;
  const args = decodeJsonStrings(decoded.args);
  return { ...decoded, args: isRecord(args) ? args : {} };
}

function normalizeDecision(raw: unknown): unknown {
  const decoded = decodeJsonStrings(raw);
  if (!isRecord(decoded)) return decoded;
  const actions = decodeJsonStrings(decoded.actions);
  const done = decodeJsonStrings(decoded.done);
  return {
    ...decoded,
    reply: stringifyUnknown(decoded.reply) ?? UNREADABLE_REPLY,
    actions: Array.isArray(actions) ? actions.map(normalizeAction) : [],
    done: done === true || done === "true" ? true : done === false || done === "false" ? false : true,
  };
}

function normalizeProposal(raw: unknown): unknown {
  const decoded = decodeJsonStrings(raw);
  if (!isRecord(decoded)) return decoded;
  const proposedAction = decodeJsonStrings(decoded.proposed_action);
  const risks = decodeJsonStrings(decoded.risks);
  const normalizedAction = isRecord(proposedAction)
    ? { ...proposedAction, payload: isRecord(decodeJsonStrings(proposedAction.payload)) ? decodeJsonStrings(proposedAction.payload) : {} }
    : proposedAction;
  return { ...decoded, proposed_action: normalizedAction, risks: Array.isArray(risks) ? risks : [] };
}

export class OpenAICompatibleReasoningClient implements ReasoningClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: OpenAICompatibleReasoningOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async decide(input: AgentInput): Promise<AgentDecision> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.apiKey}`,
          ...(this.opts.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            ...input.messages.map((message) => ({ role: message.role, content: message.content })),
          ],
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any;
      try { json = text ? JSON.parse(text) : {}; } catch { throw new Error(`LLM returned invalid JSON: ${text.slice(0, 300)}`); }
      if (!res.ok) throw new Error(json?.error?.message || `LLM HTTP ${res.status}`);

      const content = json?.choices?.[0]?.message?.content;
      const contentText = typeof content === "string" ? content : JSON.stringify(content);
      let parsedContent: unknown;
      try { parsedContent = JSON.parse(contentText); } catch { throw new Error("LLM content was not JSON"); }
      const parsedDecision = agentDecisionSchema.safeParse(normalizeDecision(parsedContent));
      if (!parsedDecision.success) {
        log.error("reasoning.decision_parse_failed", {
          issues: parsedDecision.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
          preview: contentText.slice(0, 500),
        });
        throw new Error(UNREADABLE_REPLY);
      }
      const decision = parsedDecision.data;
      log.info("reasoning.decision", { actions: decision.actions.length, done: decision.done });
      return decision;
    } finally {
      clearTimeout(timer);
    }
  }

  async propose(input: ReasoningInput): Promise<Proposal> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.apiKey}`,
          ...(this.opts.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are a SpaceMolt agent advisor. You observe game state and propose at most one next action.",
                "IMPORTANT: observe + propose only. Never claim an action was executed.",
                "Return strict JSON with keys: summary(string), should_act(boolean), proposed_action(null|{tool,action,payload,reason}), confidence(0..1), risks(string[]).",
                "If unsure or no safe action, set should_act=false and proposed_action=null.",
              ].join(" "),
            },
            {
              role: "user",
              content: `Observation JSON:\n${JSON.stringify(input.observation).slice(0, 30000)}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any;
      try { json = text ? JSON.parse(text) : {}; } catch { throw new Error(`LLM returned invalid JSON: ${text.slice(0, 300)}`); }
      if (!res.ok) {
        throw new Error(json?.error?.message || `LLM HTTP ${res.status}`);
      }
      const content = json?.choices?.[0]?.message?.content;
      const contentText = typeof content === "string" ? content : JSON.stringify(content);
      let parsedContent: unknown;
      try { parsedContent = JSON.parse(contentText); } catch { throw new Error("LLM content was not JSON"); }
      const parsedProposal = proposalSchema.safeParse(normalizeProposal(parsedContent));
      if (!parsedProposal.success) {
        log.error("reasoning.proposal_parse_failed", {
          issues: parsedProposal.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
          preview: contentText.slice(0, 500),
        });
        throw new Error(UNREADABLE_REPLY);
      }
      const proposal = parsedProposal.data;
      log.info("reasoning.proposal", { shouldAct: proposal.should_act, confidence: proposal.confidence });
      return proposal;
    } finally {
      clearTimeout(timer);
    }
  }
}
