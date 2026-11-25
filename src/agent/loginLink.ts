import { getConfig } from "../config/env.js";
import { SpaceMoltClient } from "../spacemolt/client.js";
import { accountFrom, messageFrom, type ConnectResult } from "./connect.js";
import { observeSession, type ObservationModelChoice } from "./observe.js";

export type LoginLinkStartResult = {
  linkSessionId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  instructions: string;
  interval: number;
  expiresIn: number;
};

export type LoginLinkPending = {
  complete: false;
  status: string;
  interval?: number;
};

export type LoginLinkComplete = ConnectResult & {
  complete: true;
};

export type LoginLinkPollResult = LoginLinkPending | LoginLinkComplete;

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function requiredText(value: unknown, key: string): string {
  if (!value || typeof value !== "object") throw new Error(`SpaceMolt login link missing ${key}`);
  const found = textField((value as Record<string, unknown>)[key]);
  if (!found) throw new Error(`SpaceMolt login link missing ${key}`);
  return found;
}

export async function startLoginLink(): Promise<LoginLinkStartResult> {
  const cfg = getConfig();
  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);
  const created = await client.createSession();
  const linkSessionId = created.session?.id;
  if (!linkSessionId) throw new Error("SpaceMolt did not return a session id");

  const response = await client.post("spacemolt_auth", "login_link", {}, linkSessionId);
  const content = response.structuredContent;
  return {
    linkSessionId,
    deviceCode: requiredText(content, "device_code"),
    userCode: requiredText(content, "user_code"),
    verificationUri: requiredText(content, "verification_uri"),
    verificationUriComplete: requiredText(content, "verification_uri_complete"),
    instructions: requiredText(content, "instructions"),
    interval: numberField(content && typeof content === "object" ? (content as Record<string, unknown>).interval : undefined) ?? 5,
    expiresIn: numberField(content && typeof content === "object" ? (content as Record<string, unknown>).expires_in : undefined) ?? 600,
  };
}

export async function pollLoginLink(
  linkSessionId: string,
  deviceCode: string,
  selection: ObservationModelChoice = {},
): Promise<LoginLinkPollResult> {
  const cfg = getConfig();
  const client = new SpaceMoltClient(cfg.SPACEMOLT_BASE_URL);
  const response = await client.post(
    "spacemolt_auth",
    "login_link_poll",
    { device_code: deviceCode },
    linkSessionId,
  );
  const content = response.structuredContent;
  const status = content && typeof content === "object"
    ? textField((content as Record<string, unknown>).status)
    : undefined;

  if (status) {
    return {
      complete: false,
      status,
      interval: content && typeof content === "object"
        ? numberField((content as Record<string, unknown>).interval)
        : undefined,
    };
  }

  const observation = await observeSession(client, linkSessionId, selection);
  return {
    complete: true,
    ...observation,
    sessionId: linkSessionId,
    account: accountFrom(content),
    auth: {
      mode: "login_link",
      message: messageFrom(content) ?? textField(response.result),
    },
  };
}
