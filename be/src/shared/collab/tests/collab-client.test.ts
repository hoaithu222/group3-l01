import { HttpCollabClient, NoopCollabClient } from "..";

interface Call {
  url: string;
  init: RequestInit;
}

function makeClient(handler: (call: Call) => Response | Promise<Response>, over: { baseUrl?: string | undefined; secret?: string | undefined } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  const client = new HttpCollabClient({
    baseUrl: () => ("baseUrl" in over ? over.baseUrl : "http://collab:4000/"),
    secret: () => ("secret" in over ? over.secret : "s".repeat(40)),
    fetchImpl,
  });
  return { client, calls };
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DOC = "66f1a2b3c4d5e6f708192a3c";

describe("HttpCollabClient (BE → collab)", () => {
  it("kick: gửi X-Collab-Secret + JSON, kèm ?doc=<id> để nginx băm sticky", async () => {
    const { client, calls } = makeClient(() => json({ success: true, data: { closed: 2 } }));
    const res = await client.kick({ docId: DOC, userId: "u1", reason: "revoked" });
    expect(res).toEqual({ ok: true, data: { closed: 2 } });
    expect(calls[0]?.url).toBe(`http://collab:4000/internal/kick?doc=${DOC}`);
    expect((calls[0]?.init.headers as Record<string, string>)["X-Collab-Secret"]).toBe("s".repeat(40));
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ docId: DOC, userId: "u1", reason: "revoked" });
  });

  it("kick theo workspace không kèm ?doc=", async () => {
    const { client, calls } = makeClient(() => json({ data: { closed: 0 } }));
    await client.kick({ workspaceId: "66f1a2b3c4d5e6f708192a3d", userId: "u1", reason: "forbidden" });
    expect(calls[0]?.url).toBe("http://collab:4000/internal/kick");
  });

  it("apply: mã hoá delta base64; flush: gửi {kind, docId}", async () => {
    const { client, calls } = makeClient(() => json({ data: { open: true, applied: true, connections: 1 } }));
    expect(await client.apply("document", DOC, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: true });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ kind: "document", docId: DOC, updateBase64: "AQID", reason: "restore" });
    const flush = makeClient(() => json({ data: { open: false, flushed: true, yjsVersion: null } }));
    expect(await flush.client.flush("document", DOC)).toEqual({ ok: true, data: { open: false, flushed: true, yjsVersion: null } });
  });

  it("KHÔNG BAO GIỜ ném lỗi: HTTP lỗi, mạng lỗi, quá hạn → { ok: false }", async () => {
    expect(await makeClient(() => json({ success: false }, 401)).client.kick({ docId: DOC, reason: "revoked" })).toEqual({ ok: false, error: "HTTP 401" });
    expect(await makeClient(() => json({}, 200)).client.stats()).toMatchObject({ ok: false });
    const boom = makeClient(() => {
      throw new Error("ECONNREFUSED");
    });
    expect(await boom.client.flush("document", DOC)).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  it("chưa cấu hình URL/bí mật → enabled=false và mọi lời gọi thất bại êm, không gọi mạng", async () => {
    for (const over of [{ baseUrl: undefined }, { secret: undefined }]) {
      const { client, calls } = makeClient(() => json({}), over);
      expect(client.enabled()).toBe(false);
      expect(await client.kick({ docId: DOC, reason: "revoked" })).toEqual({ ok: false, error: "collab chưa cấu hình" });
      expect(calls).toHaveLength(0);
    }
  });

  it("health: ok / degraded / down / disabled và không cần bí mật", async () => {
    expect((await makeClient(() => json({ status: "ok", connections: 3 })).client.health()).status).toBe("ok");
    expect((await makeClient(() => json({ status: "degraded" })).client.health()).status).toBe("degraded");
    expect((await makeClient(() => json({}, 503)).client.health()).status).toBe("degraded");
    const down = makeClient(() => {
      throw new Error("timeout");
    });
    expect((await down.client.health()).status).toBe("down");
    expect((await makeClient(() => json({}), { baseUrl: undefined }).client.health()).status).toBe("disabled");
    const { client, calls } = makeClient(() => json({ status: "ok" }));
    await client.health();
    expect(calls[0]?.url).toBe("http://collab:4000/health");
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.["X-Collab-Secret"]).toBeUndefined();
  });

  it("health kiểm CẢ bí mật dùng chung: collab từ chối (đổi COLLAB_SHARED_SECRET mà chưa deploy lại collab) → degraded + auth=rejected", async () => {
    const stats = (status: number) => (call: Call) =>
      call.url.endsWith("/internal/stats") ? json(status === 200 ? { success: true, data: { pendingStates: 0 } } : { success: false }, status) : json({ status: "ok" });

    const rejected = makeClient(stats(401));
    expect(await rejected.client.health()).toMatchObject({ status: "degraded", auth: "rejected", detail: { status: "ok" } });
    expect(rejected.calls.map((c) => c.url)).toEqual(["http://collab:4000/health", "http://collab:4000/internal/stats"]);
    expect((rejected.calls[1]?.init.headers as Record<string, string>)["X-Collab-Secret"]).toBe("s".repeat(40));
    expect(await makeClient(stats(200)).client.health()).toMatchObject({ status: "ok", auth: "ok" });
    // Lời gọi kiểm bí mật lỗi mạng/HTTP khác: KHÔNG hạ trạng thái — `/health` đã chứng minh collab sống.
    expect(await makeClient(stats(500)).client.health()).toMatchObject({ status: "ok", auth: "unknown" });
    const flaky = makeClient((call) => {
      if (call.url.endsWith("/internal/stats")) throw new Error("timeout");
      return json({ status: "ok" });
    });
    expect(await flaky.client.health()).toMatchObject({ status: "ok", auth: "unknown" });
    // BE chưa có bí mật → chỉ gọi `/health`, không có `auth`.
    const noSecret = makeClient(() => json({ status: "ok" }), { secret: undefined });
    const health = await noSecret.client.health();
    expect(health.status).toBe("ok");
    expect(health.auth).toBeUndefined();
    expect(noSecret.calls).toHaveLength(1);
  });

  it("NoopCollabClient: tắt hẳn", async () => {
    const noop = new NoopCollabClient();
    expect(noop.enabled()).toBe(false);
    expect((await noop.health()).status).toBe("disabled");
    expect(await noop.kick()).toMatchObject({ ok: false });
  });
});
