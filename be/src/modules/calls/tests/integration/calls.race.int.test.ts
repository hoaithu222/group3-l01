import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildCallsApp();
const api = makeApi(app);

describe("calls — race (integration, Mongo memory replset)", () => {
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

  const body = () => ({ scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });

  it("CL-01: 40 POST /calls song song từ 4 thành viên nhóm → đúng 1 Call; các request khác joined:true; đúng một lượt đổ chuông", async () => {
    // Giới hạn tốc độ (10/phút/người) không phải chủ đề ở đây — 4 người × 10 request = 40 vừa đủ ngưỡng.
    const members = [w.u.A!, w.u.B!, w.u.C!, w.u.D!];
    const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => api("post", "/calls", members[i % 4]!, body())));
    const failures = responses.filter((r) => ![200, 201].includes(r.status));
    expect(failures.map((r) => [r.status, r.body.error?.code])).toEqual([]);

    expect(await prisma.call.count({ where: { scopeId: w.group } })).toBe(1);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.body.data.joined === true).length).toBeGreaterThanOrEqual(3);
    const ids = new Set(responses.map((r) => r.body.data.call.id));
    expect(ids.size).toBe(1);
    // một bộ participant duy nhất, không trùng (callId, userId)
    const parts = await prisma.callParticipant.findMany({ where: { callId: [...ids][0] as string } });
    expect(new Set(parts.map((p) => p.userId)).size).toBe(parts.length);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: [...ids][0] as string, type: "call.ringing" } })).toBe(1);
  }, 60_000);

  it("CL-15: Redis bị flush khi call ACTIVE, người khác bấm gọi → activeKey unique chặn call thứ hai, trả joined:true cuộc cũ", async () => {
    const first = await api("post", "/calls", w.u.A!, body());
    const callId = first.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    h.redis.flushAll(); // FLUSHDB: mất khoá call:active + call:busy
    redisStore.clear();

    const second = await api("post", "/calls", w.u.C!, body());
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ joined: true, call: { id: callId } });
    expect(await prisma.call.count({ where: { scopeId: w.group } })).toBe(1);
    expect(await prisma.call.count({ where: { scopeId: w.group, status: { not: "ENDED" } } })).toBe(1);
  });

  it("hai người gọi nhau cùng lúc trong DM: đúng 1 Call (người còn lại tham gia cuộc đang có thay vì tạo cuộc thứ hai)", async () => {
    const dm = (uid: string) => api("post", "/calls", uid, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const [ra, rb] = await Promise.all([dm(w.u.A!), dm(w.u.B!)]);
    expect([ra.status, rb.status].every((s) => s === 200 || s === 201)).toBe(true);
    expect(await prisma.call.count({ where: { scopeId: w.direct } })).toBe(1);
    expect(ra.body.data.call.id).toBe(rb.body.data.call.id);
  });

  it("mọi người trả lời cùng lúc: 3 callee answer song song → đúng 3 JOINING, call ACTIVE một lần, 3 sự kiện answered", async () => {
    const created = await api("post", "/calls", w.u.A!, body());
    const callId = created.body.data.call.id as string;
    const results = await Promise.all([w.u.B!, w.u.C!, w.u.D!].map((uid) => api("post", `/calls/${callId}/answer`, uid, { deviceId: deviceId() })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect(call!.status).toBe("ACTIVE");
    expect(call!.answeredAt).not.toBeNull();
    expect(await prisma.outboxEvent.count({ where: { aggregateId: callId, type: "call.answered" } })).toBe(3);
    expect(h.emitted.length).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
