export interface SpaceMoltSession {
  id: string;
  player_id?: string;
  expires_at?: string;
}

export interface SpaceMoltResponse<T = unknown> {
  result?: string;
  structuredContent?: T;
  notifications?: unknown[];
  session?: SpaceMoltSession;
  error?: { code?: string; message?: string; [k: string]: unknown } | string;
  http_error?: number;
  body?: string;
}

export class SpaceMoltApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "SpaceMoltApiError";
  }
}
