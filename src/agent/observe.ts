import { getConfig, resolveProviderRuntime } from "../config/env.js";
import { log } from "../logger.js";
import { isAllowedModel, type LLMProviderKey } from "../reasoning/models.js";
import { OpenAICompatibleReasoningClient } from "../reasoning/openaiCompatible.js";
import type { Proposal } from "../reasoning/types.js";
import { SpaceMoltClient } from "../spacemolt/client.js";
import { observeSpaceMolt } from "../spacemolt/observe.js";
import { SpaceMoltApiError } from "../spacemolt/types.js";

export class InvalidTokenError extends Error {
  constructor() {
    super("Invalid or expired SpaceMolt token");
    this.name = "InvalidTokenError";
  }
}

export interface ObservationResult {
  ok: boolean;
  mode: "observe_propose_only";
  observed: {
    hasStatus: boolean;
    notificationCount: number;
  };
  proposal?: Proposal | null;
  reasoning_error?: string;
  error?: string;
}

function failedObservation(): ObservationResult {
  return {
    ok: false,
    mode: "observe_propose_only",
    observed: { hasStatus: false, notificationCount: 0 },
    error: "observation_failed",
  };
}

export type ObservationModelChoice = { provider?: LLMProviderKey; model?: string };

export async function observeSession(
  client: SpaceMoltClient,
  sessionId: string,
  selection: ObservationModelChoice = {},
): Promise<ObservationResult> {
  const cfg = getConfig();
  const providerKey = selection.provider ?? cfg.llmProvider;
  const runtime = resolveProviderRuntime(cfg, providerKey);
  const model = selection.model && await isAllowedModel(providerKey, runtime.model, selection.model)
    ? selection.model
    : runtime.model;
  const reasoning = new OpenAICompatibleReasoningClient({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    model,
    timeoutMs: runtime.timeoutMs,
    extraHeaders: runtime.extraHeaders,
  });

  let observation;
  try {
    observation = await observeSpaceMolt(client, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("observe.failed", { message });
    return failedObservation();
  }

  let proposal: Proposal | null = null;
  let reasoningError: string | undefined;
  try {
    proposal = await reasoning.propose({ observation });
  } catch (err) {
    reasoningError = err instanceof Error ? err.message : String(err);
    log.error("observe.reasoning_failed", { message: reasoningError });
  }

  return {
    ok: true,
    mode: "observe_propose_only",
    observed: {
      hasStatus: observation.status !== undefined,
      notificationCount: observation.notifications.length,
    },
    proposal,
    reasoning_error: reasoningError,
  };
}

export async function observeWithToken(
  token: string,
  selection: ObservationModelChoice = {},
): Promise<ObservationResult> {
  const cfg = getConfig();
  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);

  try {
    const created = await client.createSession();
    const sessionId = created.session?.id;
    if (!sessionId) throw new Error("SpaceMolt did not return a session id");

    await client.post("spacemolt_auth", "login_token", { token }, sessionId);
    return await observeSession(client, sessionId, selection);
  } catch (err) {
    if (err instanceof SpaceMoltApiError && (err.code === "auth_failed" || err.code === "not_authenticated")) {
      throw new InvalidTokenError();
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("observe.failed", { message });
    return failedObservation();
  }
}
