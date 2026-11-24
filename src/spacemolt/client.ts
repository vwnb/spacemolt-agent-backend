import { log } from "../logger.js";
import { SpaceMoltApiError, type SpaceMoltResponse } from "./types.js";

export class SpaceMoltClient {
  constructor(private readonly baseUrl: string) {}

  async createSession(): Promise<SpaceMoltResponse> {
    return this.request("session", {});
  }

  async post<T = unknown>(
    tool: string,
    action: string,
    payload: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<SpaceMoltResponse<T>> {
    return this.request<T>(`${encodeURIComponent(tool)}/${encodeURIComponent(action)}`, payload, sessionId);
  }

  private async request<T>(
    path: string,
    payload: Record<string, unknown>,
    sessionId?: string,
  ): Promise<SpaceMoltResponse<T>> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionId) headers["X-Session-Id"] = sessionId;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: SpaceMoltResponse<T>;
    try {
      json = text ? (JSON.parse(text) as SpaceMoltResponse<T>) : {};
    } catch {
      throw new SpaceMoltApiError(`Invalid JSON from SpaceMolt ${path}`, res.status, undefined, text.slice(0, 500));
    }

    if (!res.ok) {
      const code = typeof json.error === "object" ? json.error?.code : undefined;
      const msg = typeof json.error === "object" ? json.error?.message : typeof json.error === "string" ? json.error : res.statusText;
      throw new SpaceMoltApiError(msg || `SpaceMolt HTTP ${res.status}`, res.status, code, json);
    }

    if (json.error) {
      const code = typeof json.error === "object" ? json.error.code : undefined;
      const msg = typeof json.error === "object" ? json.error.message : String(json.error);
      throw new SpaceMoltApiError(msg || "SpaceMolt error", 400, code, json);
    }

    log.debug("spacemolt.response", { path, hasStructured: json.structuredContent !== undefined, notifications: json.notifications?.length ?? 0 });
    return json;
  }
}
