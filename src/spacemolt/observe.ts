import { SpaceMoltClient } from "./client.js";

export interface Observation {
  status: unknown;
  notifications: unknown[];
  raw: {
    statusResult?: string;
    notificationsResult?: string;
  };
}

export async function observeSpaceMolt(client: SpaceMoltClient, sessionId: string): Promise<Observation> {
  const status = await client.post("spacemolt", "get_status", {}, sessionId);
  let notifications: unknown[] = [];
  let notificationsResult: string | undefined;
  try {
    const n = await client.post("spacemolt", "get_notifications", { clear: true, limit: 50 }, sessionId);
    notifications = Array.isArray(n.structuredContent) ? n.structuredContent : Array.isArray(n.notifications) ? n.notifications : [];
    notificationsResult = n.result;
  } catch {
    // get_notifications is throttled once/tick; non-fatal for observation
    notifications = [];
  }

  return {
    status: status.structuredContent ?? status.result ?? status,
    notifications,
    raw: {
      statusResult: status.result,
      notificationsResult,
    },
  };
}
