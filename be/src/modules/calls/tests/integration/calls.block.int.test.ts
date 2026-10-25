import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildCallsApp();
const api = makeApi(app);

/**
 * BLOCK-07 (p1-08 README §"Gọi", be.md p2-01): người ĐÃ CHẶN người gọi không bị đổ chuông ở nhóm chat (chặn theo hướng người-chặn); 1-1 bị chặn → `CALL_002`.
 * `BlockPort` THẬT (collection `UserBlock` trên Mongo memory + Redis giả) — không phải bản giả.
 */
describe("calls — chặn người dùng (p1-08 BLOCK-07, integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  const blockIds: string[] = [];
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
    if (blockIds.length > 0) await prisma.userBlock.deleteMany({ where: { id: { in: blockIds.splice(0) } } });
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const block = async (blocker: string, blocked: string) => {
    const row = await prisma.userBlock.create({ data: { blockerId: blocker, blockedId: blocked } });
    blockIds.push(row.id);
  };
  const callGroup = (userId: string) =>
    api("post", "/calls", userId, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });

  it("nhóm chat: C đã chặn A → A gọi nhóm, C KHÔNG đổ chuông (không participant, không push) nhưng vẫn nhận banner ring:false; B, D vẫn đổ chuông", async () => {
    await block(w.u.C!, w.u.A!);

    const res = await callGroup(w.u.A!);
    expect(res.status).toBe(201);
    const callId = res.body.data.call.id as string;
    await drainOutbox(h);

    const ringing = await prisma.callParticipant.findMany({ where: { callId }, select: { userId: true, state: true } });
    expect(ringing.map((p) => p.userId).sort()).toEqual([w.u.A, w.u.B, w.u.D].sort()); // C không có hàng participant
    expect(ringing.find((p) => p.userId === w.u.B)!.state).toBe("RINGING");

    const incomingC = h.eventsTo(w.u.C!, "call:incoming");
    expect(incomingC).toHaveLength(1);
    expect(incomingC[0]!.payload).toMatchObject({ callId, ring: false });
    for (const id of [w.u.B!, w.u.D!]) expect(h.eventsTo(id, "call:incoming")[0]!.payload).toMatchObject({ ring: true });

    const push = h.notified.find((n) => n.type === "call.incoming")!;
    expect(push.recipients.map((r) => r.userId).sort()).toEqual([w.u.B, w.u.D].sort());
  });

  it("chiều ngược: A đã chặn C rồi A gọi nhóm → hiệu ứng thống nhất là chặn theo hướng NGƯỜI CHẶN — C vẫn đổ chuông (không lọc theo người bị chặn)", async () => {
    await block(w.u.A!, w.u.C!);
    const res = await callGroup(w.u.A!);
    expect(res.status).toBe(201);
    await drainOutbox(h);
    expect(h.eventsTo(w.u.C!, "call:incoming")[0]!.payload).toMatchObject({ ring: true });
  });

  it("chặn KHÔNG cản người gọi khác: B (không bị ai chặn) gọi nhóm → C vẫn đổ chuông", async () => {
    await block(w.u.C!, w.u.A!);
    const res = await callGroup(w.u.B!);
    expect(res.status).toBe(201);
    await drainOutbox(h);
    expect(h.eventsTo(w.u.C!, "call:incoming")[0]!.payload).toMatchObject({ ring: true });
  });

  it("1-1: B đã chặn A → A gọi B bị từ chối trung tính 403 CALL_002, không tạo cuộc gọi, B không đổ chuông", async () => {
    await block(w.u.B!, w.u.A!);
    const res = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect([res.status, res.body.error.code]).toEqual([403, "CALL_002"]);
    expect(await prisma.call.count({ where: { scopeId: w.direct } })).toBe(0);
    await drainOutbox(h);
    expect(h.eventsTo(w.u.B!, "call:incoming")).toHaveLength(0);
  });
});
