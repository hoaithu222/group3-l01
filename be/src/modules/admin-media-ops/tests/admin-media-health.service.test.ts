import { InMemoryMediaServer, NoopMediaServer, type IMediaServer, type MediaRoom } from "../../../infrastructure/media";
import type { IMediaOpsHealthReader } from "../repositories/media-ops-read.repository.interface";
import { MemoryCache } from "../services/admin-media-cache";
import { AdminMediaHealthService, type HealthDeps } from "../services/admin-media-health.service";

/**
 * OPC-07 (p2-07 be.md §10): `check()` KHÔNG BAO GIỜ ném — LiveKit lỗi/treo quá `healthTimeoutMs` (3 s) → phần đó `DOWN` + `error` đã làm sạch (không URL/khoá), trạng thái
 * tổng `DEGRADED`; chưa cấu hình → `DISABLED`; thiếu khoá TURN → `UNKNOWN`; cache trúng thì không gọi lại LiveKit.
 */
const NOW = new Date("2026-09-26T03:00:00Z");

function reader(over: Partial<IMediaOpsHealthReader> = {}): IMediaOpsHealthReader {
  return {
    lastLiveKitWebhookAt: () => Promise.resolve(new Date(NOW.getTime() - 30_000)),
    liveKitWebhookCountsSince: () => Promise.resolve({ received: 40, failed: 0 }),
    failedRecordingsSince: () => Promise.resolve(0),
    ...over,
  };
}

function build(server: IMediaServer, over: Partial<HealthDeps> = {}) {
  const cache = new MemoryCache(() => NOW.getTime());
  const svc = new AdminMediaHealthService({
    media: () => server,
    reader: reader(),
    cache,
    queueCounts: () => Promise.resolve({ waiting: 1, delayed: 2, failed: 0 }),
    turnProbe: () => Promise.resolve({ at: new Date(NOW.getTime() - 60_000).toISOString(), ok: true }),
    now: () => NOW,
    ...over,
  });
  return { svc, cache };
}

const liveServer = (): InMemoryMediaServer => {
  const s = new InMemoryMediaServer();
  s.join("call_c1", { identity: "u1" });
  s.join("call_c1", { identity: "u2" });
  s.join("meet_abcdefghij", { identity: "u3" });
  return s;
};

describe("AdminMediaHealthService", () => {
  it("mọi thứ khoẻ → OK; đếm phòng/người, egress, webhook, TURN, hàng đợi", async () => {
    const { svc } = build(liveServer());
    const h = await svc.check();
    expect(h.status).toBe("OK");
    expect(h.checkedAt).toBe(NOW.toISOString());
    expect(h.livekit).toMatchObject({ status: "OK", rooms: 2, participants: 3 });
    expect(typeof h.livekit.latencyMs).toBe("number");
    expect(h.egress).toEqual({ status: "OK", active: 0, failed24h: 0 });
    expect(h.webhook).toEqual({ status: "OK", lastReceivedAt: new Date(NOW.getTime() - 30_000).toISOString(), received1h: 40, failed1h: 0 });
    expect(h.turn).toEqual({ status: "OK", lastProbeAt: new Date(NOW.getTime() - 60_000).toISOString(), lastProbeOk: true });
    expect(h.queues).toEqual({ calls: { waiting: 1, delayed: 2, failed: 0 }, media: { waiting: 1, delayed: 2, failed: 0 } });
  });

  it("LiveKit ném lỗi → 200 logic: livekit DOWN + error đã làm sạch, tổng DEGRADED, KHÔNG throw", async () => {
    const server = liveServer();
    server.failNext("listRooms");
    const { svc } = build(server);
    const h = await svc.check();
    expect(h.status).toBe("DEGRADED");
    expect(h.livekit).toEqual({ status: "DOWN", error: "Không kết nối được máy chủ media, thử lại sau" });
    expect(JSON.stringify(h)).not.toMatch(/https?:\/\/|wss?:\/\/|apiKey|secret|stack/i);
  });

  it("lỗi lạ (chứa URL/khoá trong message) → thông điệp chung, KHÔNG lộ nguyên văn", async () => {
    const server = liveServer();
    server.failNext("listRooms", new Error("connect ECONNREFUSED https://lk.internal:7880/twirp?apiKey=SECRET123"));
    const { svc } = build(server);
    const h = await svc.check();
    expect(h.livekit.status).toBe("DOWN");
    expect(JSON.stringify(h)).not.toMatch(/ECONNREFUSED|lk\.internal|SECRET123/);
  });

  describe("treo quá healthTimeoutMs", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("LiveKit treo → 'Hết thời gian chờ' sau 3 s, tổng DEGRADED, không throw", async () => {
      const hanging = liveServer();
      hanging.listRooms = () => new Promise<MediaRoom[]>(() => undefined);
      const { svc } = build(hanging);
      const pending = svc.check();
      await jest.advanceTimersByTimeAsync(3001);
      const h = await pending;
      expect(h.status).toBe("DEGRADED");
      expect(h.livekit).toEqual({ status: "DOWN", error: "Hết thời gian chờ" });
    });

    it("hàng đợi (Redis/BullMQ) treo → error 'Hết thời gian chờ' + số đếm 0, KHÔNG kéo trạng thái tổng", async () => {
      const { svc } = build(liveServer(), { queueCounts: () => new Promise(() => undefined) });
      const pending = svc.check();
      await jest.advanceTimersByTimeAsync(3001);
      const h = await pending;
      expect(h.status).toBe("OK");
      expect(h.queues.calls).toEqual({ waiting: 0, delayed: 0, failed: 0, error: "Hết thời gian chờ" });
    });
  });

  it("LiveKit chưa cấu hình → DISABLED (livekit/egress/webhook) và tổng DISABLED; endpoint vẫn trả dữ liệu", async () => {
    const { svc } = build(new NoopMediaServer());
    const h = await svc.check();
    expect(h.status).toBe("DISABLED");
    expect(h.livekit).toEqual({ status: "DISABLED" });
    expect(h.egress).toEqual({ status: "DISABLED" });
    expect(h.webhook.status).toBe("DISABLED");
    expect(h.turn).toEqual({ status: "DISABLED" });
  });

  it("thiếu khoá probe TURN → UNKNOWN (không kéo tổng); probe thất bại hoặc cũ hơn 10 phút → DEGRADED", async () => {
    expect((await build(liveServer(), { turnProbe: () => Promise.resolve(null) }).svc.check()).turn).toEqual({ status: "UNKNOWN" });
    const failed = await build(liveServer(), { turnProbe: () => Promise.resolve({ at: NOW.toISOString(), ok: false, error: "Internal detail https://turn.example" }) }).svc.check();
    expect(failed.turn).toMatchObject({ status: "DEGRADED", lastProbeOk: false, error: "Probe TURN thất bại" });
    expect(failed.status).toBe("DEGRADED");
    expect(JSON.stringify(failed)).not.toContain("turn.example");
    const stale = await build(liveServer(), { turnProbe: () => Promise.resolve({ at: new Date(NOW.getTime() - 11 * 60_000).toISOString(), ok: true }) }).svc.check();
    expect(stale.turn.status).toBe("DEGRADED");
  });

  it("webhook: có phòng đang mở mà > 5 phút không nhận, hoặc có lỗi trong 1 giờ → DEGRADED; phòng trống + im lặng thì bình thường", async () => {
    const silent = await build(liveServer(), { reader: reader({ lastLiveKitWebhookAt: () => Promise.resolve(new Date(NOW.getTime() - 6 * 60_000)) }) }).svc.check();
    expect(silent.webhook.status).toBe("DEGRADED");
    expect(silent.status).toBe("DEGRADED");
    const noEvent = await build(liveServer(), { reader: reader({ lastLiveKitWebhookAt: () => Promise.resolve(null) }) }).svc.check();
    expect(noEvent.webhook.status).toBe("DEGRADED");
    const failing = await build(liveServer(), { reader: reader({ liveKitWebhookCountsSince: () => Promise.resolve({ received: 10, failed: 2 }) }) }).svc.check();
    expect(failing.webhook).toMatchObject({ status: "DEGRADED", failed1h: 2 });
    const emptyRooms = await build(new InMemoryMediaServer(), { reader: reader({ lastLiveKitWebhookAt: () => Promise.resolve(new Date(NOW.getTime() - 2 * 3_600_000)) }) }).svc.check();
    expect(emptyRooms.webhook.status).toBe("OK");
  });

  it("egress lỗi > 3 trong 24 giờ → DEGRADED; listEgress lỗi → UNKNOWN + error (không kéo tổng)", async () => {
    const many = await build(liveServer(), { reader: reader({ failedRecordingsSince: () => Promise.resolve(4) }) }).svc.check();
    expect(many.egress).toMatchObject({ status: "DEGRADED", failed24h: 4 });
    expect(many.status).toBe("DEGRADED");
    const three = await build(liveServer(), { reader: reader({ failedRecordingsSince: () => Promise.resolve(3) }) }).svc.check();
    expect(three.egress.status).toBe("OK");
    const server = liveServer();
    server.failNext("listEgress");
    const noEgress = await build(server).svc.check();
    expect(noEgress.egress).toMatchObject({ status: "UNKNOWN", failed24h: 0 });
    expect(noEgress.egress.error).toBeTruthy();
    expect(noEgress.status).toBe("OK");
  });

  it("hàng đợi calls có > 50 job chờ → DEGRADED", async () => {
    const h = await build(liveServer(), { queueCounts: (n) => Promise.resolve({ waiting: n === "calls" ? 51 : 0, delayed: 0, failed: 0 }) }).svc.check();
    expect(h.status).toBe("DEGRADED");
  });

  it("cache trúng (< 15 s) → không gọi lại LiveKit; hết hạn → gọi lại", async () => {
    const server = liveServer();
    let now = NOW.getTime();
    const cache = new MemoryCache(() => now);
    const svc = new AdminMediaHealthService({ media: () => server, reader: reader(), cache, queueCounts: () => Promise.resolve({ waiting: 0, delayed: 0, failed: 0 }), turnProbe: () => Promise.resolve(null), now: () => new Date(now) });
    await svc.check();
    now += 10_000;
    const again = await svc.check();
    expect(server.callsOf("listRooms")).toHaveLength(1);
    expect(again.checkedAt).toBe(NOW.toISOString());
    now += 6_000;
    await svc.check();
    expect(server.callsOf("listRooms")).toHaveLength(2);
  });
});
