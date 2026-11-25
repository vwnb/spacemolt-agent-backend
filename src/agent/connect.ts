import { getConfig } from "../config/env.js";
import { log } from "../logger.js";
import { SpaceMoltClient } from "../spacemolt/client.js";
import { SpaceMoltApiError } from "../spacemolt/types.js";
import { observeSession, type ObservationModelChoice, type ObservationResult } from "./observe.js";

export type ConnectInput = {
  mode: "register";
  username: string;
  empire: "solarian" | "voidborn" | "crimson" | "nebula" | "outerrim";
  registrationCode: string;
} & ObservationModelChoice;

export type ConnectAccount = {
  username?: string;
  playerId?: string;
  password?: string;
};

export type ConnectResult = ObservationResult & {
  sessionId: string;
  account: ConnectAccount;
  auth: {
    mode: "register" | "login_link";
    message?: string;
  };
};

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function accountFrom(value: unknown): ConnectAccount {
  if (!value || typeof value !== "object") return {};
  const content = value as Record<string, unknown>;
  const player = content.player && typeof content.player === "object"
    ? (content.player as Record<string, unknown>)
    : {};
  return {
    username: textField(content.username) ?? textField(player.username),
    playerId: textField(content.player_id) ?? textField(player.id),
    password: textField(content.password),
  };
}

export function messageFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const content = value as Record<string, unknown>;
  return textField(content.message);
}

export async function connectAndObserve(input: ConnectInput): Promise<ConnectResult> {
  const cfg = getConfig();
  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);
  const created = await client.createSession();
  const sessionId = created.session?.id;
  if (!sessionId) throw new Error("SpaceMolt did not return a session id");

  const response = await client.post("spacemolt_auth", "register", {
    username: input.username,
    empire: input.empire,
    registration_code: input.registrationCode,
  }, sessionId);
  const authContent = response.structuredContent;

  const observation = await observeSession(client, sessionId, {
    provider: input.provider,
    model: input.model,
  });
  return {
    ...observation,
    sessionId,
    account: accountFrom(authContent),
    auth: { mode: "register", message: messageFrom(authContent) ?? textField(response.result) },
  };
}

export function connectFailureMessage(err: unknown): { message: string; status: number } {
  if (err instanceof SpaceMoltApiError) {
    return { message: err.message, status: err.status === 401 ? 401 : err.status === 429 ? 429 : 400 };
  }
  log.error("connect.failed", { message: err instanceof Error ? err.message : String(err) });
  return { message: "Could not connect to SpaceMolt", status: 500 };
}
