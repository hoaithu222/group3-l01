import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";

const app = buildCallsApp();
const api = makeApi(app);

/** p2-02 `POST /calls/:id/ack` — thiết bị người được gọi xác nhận đã hiện/đổ chuông (Mongo memory replset thật). */
describe("calls — POST /calls/:id/ack (integration)", () => {
  const worlds: World[] = [];
  let h: CallsHarness;
  let w: World;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const startDirect = async (): Promise<string> => {
    const res = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId("a1") });
    expect(res.status).toBe(201);
    await drainOutbox(h); // INVITED → RINGING + call:incoming
    return res.body.data.call.id as string;
  };
  const participantOf = (callId: string, userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
  const ackedEventsTo = (userId: string) =>
    h.eventsTo(userId, "call:participant-updated").filter((e) => (e.payload.participant as { ringAckedAt?: string | null }).ringAckedAt);

  it("callee ack: 200 { ok, acked }, ghi lastRingAckAt + deviceId; người gọi nhận call:participant-updated có ringAckedAt", async () => {
    const callId = await startDirect();
    const b1 = deviceId("b1");
    const res = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "PUSH" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, acked: true });

    expect(await participantOf(callId, w.u.B!)).toMatchObject({ state: "RINGING", ringAckDeviceIds: [b1] });
    expect((await participantOf(callId, w.u.B!))?.lastRingAckAt).toBeInstanceOf(Date);

    await drainOutbox(h);
    const seen = ackedEventsTo(w.u.A!);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.payload).toMatchObject({ callId, participant: { userId: w.u.B, state: "RINGING" } });

    // `GET /calls/:id` của người gọi thấy cờ ringAckedAt của callee.
    const detail = await api("get", `/calls/${callId}`, w.u.A!);
    const calleeView = (detail.body.data.participants as Array<{ userId: string; ringAckedAt: string | null }>).find((p) => p.userId === w.u.B);
    expect(calleeView?.ringAckedAt).toEqual(expect.any(String));
  });

  it("idempotent: cùng thiết bị ack lặp không ghi thêm; máy thứ hai chỉ thêm vào danh sách, KHÔNG phát lại tín hiệu", async () => {
    const callId = await startDirect();
    const [b1, b2] = [deviceId("b1"), deviceId("b2")];
    await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "SOCKET" });
    const before = await prisma.outboxEvent.count({ where: { aggregateId: callId, type: "call.participant-changed" } });
    const again = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "PUSH" });
    expect(again.body.data.acked).toBe(true);
    await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b2, via: "PUSH" });

    expect(await prisma.outboxEvent.count({ where: { aggregateId: callId, type: "call.participant-changed" } })).toBe(before);
    expect((await participantOf(callId, w.u.B!))?.ringAckDeviceIds).toEqual([b1, b2]);
    await drainOutbox(h);
    expect(ackedEventsTo(w.u.A!)).toHaveLength(1);
  });

  it("chỉ giữ tối đa 5 thiết bị gần nhất", async () => {
    const callId = await startDirect();
    const devices = Array.from({ length: 6 }, (_v, i) => deviceId(`b${i}`));
    for (const d of devices) await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: d, via: "PUSH" });
    expect((await participantOf(callId, w.u.B!))?.ringAckDeviceIds).toEqual(devices.slice(1));
  });

  it("hai máy ack đồng thời: cả hai đều được ghi (CAS version + đọc lại)", async () => {
    const callId = await startDirect();
    const [b1, b2] = [deviceId("b1"), deviceId("b2")];
    const [r1, r2] = await Promise.all([
      api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "PUSH" }),
      api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b2, via: "SOCKET" }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect([...((await participantOf(callId, w.u.B!))?.ringAckDeviceIds ?? [])].sort()).toEqual([b1, b2].sort());
  });

  it("đã trả lời (JOINING) → 200 no-op acked:false, không ghi gì", async () => {
    const callId = await startDirect();
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId("b1") });
    const res = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b2"), via: "PUSH" });
    expect(res.status).toBe(200);
    expect(res.body.data.acked).toBe(false);
    expect(await participantOf(callId, w.u.B!)).toMatchObject({ state: "JOINING", ringAckDeviceIds: [] });
  });

  it("người ngoài cuộc → 403 CALL_014; cuộc gọi đã kết thúc → 410 CALL_005; body sai → 400", async () => {
    const callId = await startDirect();
    const outsider = await api("post", `/calls/${callId}/ack`, w.u.E!, { deviceId: deviceId("e1"), via: "PUSH" });
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe("CALL_014");

    expect((await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: "ngan" })).status).toBe(400);

    await api("post", `/calls/${callId}/cancel`, w.u.A!);
    const ended = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b1"), via: "PUSH" });
    expect(ended.status).toBe(410);
    expect(ended.body.error.code).toBe("CALL_005");
  });

  // ── Hợp đồng be.md §13.1 (đợt kiểm p2-02, 2026-09-26): các mép chưa có ca riêng ──────────────────────────────────────────────────────────
  it("chưa đăng nhập → 401; thiếu/sai `via` → 400 dù deviceId hợp lệ", async () => {
    const callId = await startDirect();
    expect((await request(app).post(`/api/v1/calls/${callId}/ack`).send({ deviceId: deviceId("b1"), via: "PUSH" })).status).toBe(401);
    expect((await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b1") })).status).toBe(400);
    expect((await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b1"), via: "EMAIL" })).status).toBe(400);
    expect(await participantOf(callId, w.u.B!)).toMatchObject({ ringAckDeviceIds: [] });
  });

  it("ack KHÔNG đổi status/version của Call (chỉ ghi participant); người gọi (INITIATOR) ack cho chính mình là no-op acked:false", async () => {
    const callId = await startDirect();
    const before = await prisma.call.findUnique({ where: { id: callId }, select: { status: true, version: true } });

    const ok = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b1"), via: "SOCKET" });
    expect(ok.body.data.acked).toBe(true);
    const caller = await api("post", `/calls/${callId}/ack`, w.u.A!, { deviceId: deviceId("a1"), via: "SOCKET" });
    expect(caller.status).toBe(200);
    expect(caller.body.data.acked).toBe(false);

    expect(await prisma.call.findUnique({ where: { id: callId }, select: { status: true, version: true } })).toEqual(before);
  });

  it("410 CALL_005 mang details.endReason của cuộc gọi đã kết thúc (app dựa vào để hiện lý do)", async () => {
    const callId = await startDirect();
    await api("post", `/calls/${callId}/cancel`, w.u.A!);

    const ended = await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: deviceId("b1"), via: "PUSH" });

    expect(ended.status).toBe(410);
    expect(ended.body.error.code).toBe("CALL_005");
    expect(ended.body.error.details).toMatchObject({ endReason: expect.any(String) });
  });

  it("giới hạn 20 lần/phút/(người × cuộc gọi): lần 21 → 429; người khác trong cùng cuộc gọi không bị ảnh hưởng", async () => {
    const callId = await startDirect();
    const b1 = deviceId("b1");
    for (let i = 0; i < 20; i += 1) {
      expect((await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "PUSH" })).status).toBe(200);
    }
    expect((await api("post", `/calls/${callId}/ack`, w.u.B!, { deviceId: b1, via: "PUSH" })).status).toBe(429);
    expect((await api("post", `/calls/${callId}/ack`, w.u.A!, { deviceId: deviceId("a1"), via: "PUSH" })).status).toBe(200);
  });
});
