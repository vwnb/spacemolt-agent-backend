import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("../src/spacemolt/client.js", () => ({
  SpaceMoltClient: class {
    post = postMock;
    constructor(readonly baseUrl: string) {}
  },
}));
vi.mock("../src/config/env.js", () => ({
  getConfig: () => ({ ALLOWED_ORIGIN: "*", SPACEMOLT_BASE_URL: "https://game.example" }),
}));
vi.mock("../src/http/cors.js", () => ({ corsHeaders: () => ({}) }));

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    setHeader: vi.fn(),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(value: unknown) {
      res.body = value;
      return res;
    },
  };
  return res;
}

describe("POST /api/execute", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns real action results when SpaceMolt answers promptly", async () => {
    postMock.mockResolvedValue({ structuredContent: { hostile: true } });
    const handler = (await import("../api/execute.js")).default;
    const req: any = {
      method: "POST",
      headers: {},
      body: { sessionId: "s1", actions: [{ tool: "spacemolt", action: "attack", args: { id: "pirate-1" } }] },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.actions[0].pending).toBeUndefined();
    expect(postMock).toHaveBeenCalledWith("spacemolt", "attack", { id: "pirate-1" }, "s1");
  });

  it("marks slow approved actions submitted instead of failed", async () => {
    vi.useFakeTimers();
    postMock.mockImplementation(() => new Promise(() => {}));
    const handler = (await import("../api/execute.js")).default;
    const req: any = {
      method: "POST",
      headers: {},
      body: { sessionId: "s1", actions: [{ tool: "spacemolt", action: "attack", args: { id: "pirate-1" } }] },
    };
    const res = makeRes();

    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(45_000);
    await pending;

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.pending).toBe(true);
    expect(res.body.actions[0]).toMatchObject({ ok: true, pending: true });
    expect(postMock).toHaveBeenCalledWith("spacemolt", "attack", { id: "pirate-1" }, "s1");
  });
});
