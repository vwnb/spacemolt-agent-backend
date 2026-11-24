import { beforeEach, describe, expect, it, vi } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("../src/spacemolt/client.js", () => ({
  SpaceMoltClient: class {
    post = postMock;
    constructor(readonly baseUrl: string) {}
  },
}));
vi.mock("../src/agent/connect.js", () => ({
  connectFailureMessage: (err: Error) => ({ message: err.message, status: 500 }),
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

describe("POST /api/action", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ structuredContent: { in_transit: true, transit_type: "jump" } });
  });

  it("runs a safe jump action directly", async () => {
    const handler = (await import("../api/action.js")).default;
    const req: any = {
      method: "POST",
      headers: {},
      body: { sessionId: "s1", tool: "spacemolt", action: "jump", args: { id: "sys2" } },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(postMock).toHaveBeenCalledWith("spacemolt", "jump", { id: "sys2" }, "s1");
    expect(res.body.action.ok).toBe(true);
  });

  it("refuses approval-gated actions", async () => {
    const handler = (await import("../api/action.js")).default;
    const req: any = {
      method: "POST",
      headers: {},
      body: { sessionId: "s1", action: "chat", args: { target: "system", content: "hi" } },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/location", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ structuredContent: { system: "Sol", in_transit: false } });
  });

  it("reads live transit state", async () => {
    const handler = (await import("../api/location.js")).default;
    const req: any = { method: "POST", headers: {}, body: { sessionId: "s1" } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(postMock).toHaveBeenCalledWith("spacemolt", "get_location", {}, "s1");
    expect(res.body.location.system).toBe("Sol");
  });

  it("unwraps the nested location from the full state envelope", async () => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      structuredContent: {
        player: { username: "Eunseo Moon" },
        location: {
          system_id: "alpha_centauri",
          in_transit: true,
          transit_type: "jump",
          transit_dest_system_name: "Tau Ceti",
        },
      },
    });
    const handler = (await import("../api/location.js")).default;
    const req: any = { method: "POST", headers: {}, body: { sessionId: "s1" } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.location).toEqual({
      system_id: "alpha_centauri",
      in_transit: true,
      transit_type: "jump",
      transit_dest_system_name: "Tau Ceti",
    });
  });
});
