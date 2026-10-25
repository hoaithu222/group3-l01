import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildCallsApp();
const api = makeApi(app);

describe("calls — hết giờ đổ chuông và recovery (integration, Mongo memory replset)", () => {
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

  const call = async (scopeId: string, uid = w.u.A!) => {
    const res = await api("post", "/calls", uid, { scopeType: "CONVERSATION", scopeId, mediaKind: "VIDEO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(res.status).toBe(201);
    return res.body.data.call.id as string;
  };

  it("CL-05: không ai trả lời — job hết giờ (outbox availableAt = +45 s) → ENDED/NO_ANSWER, đúng 1 tin tóm tắt, push missed, khoá Redis nhả", async () => {
    const callId = await call(w.direct);
    const timeout = await prisma.outboxEvent.findFirst({ where: { aggregateId: callId, jobName: "call.ring-timeout" } });
    expect(timeout!.availableAt.getTime() - Date.now()).toBeGreaterThan(40_000);
    expect(timeout!.availableAt.getTime() - Date.now()).toBeLessThanOrEqual(45_000);
    await drainOutbox(h); // chưa tới hạn: chỉ signal
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("RINGING");

    await drainOutbox(h, { includeFuture: true }); // tới hạn: chạy call.ring-timeout, rồi call.ended + call.summary phát sinh
    await drainOutbox(h, { includeFuture: true });
    const ended = await prisma.call.findUnique({ where: { id: callId } });
    expect([ended!.status, ended!.endReason, ended!.durationSec]).toEqual(["ENDED", "NO_ANSWER", 0]);
    const [pa, pb] = await Promise.all([
      prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.A! } } }),
      prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } }),
    ]);
    expect([pa!.outcome, pb!.state, pb!.outcome]).toEqual(["OUTGOING_UNANSWERED", "MISSED", "MISSED"]);
    expect(h.eventsTo(w.u.B!, "call:cancelled")[0]!.payload).toMatchObject({ reason: "NO_ANSWER" });
    expect(h.eventsTo(w.u.A!, "call:ended")).toHaveLength(1);
    expect(h.notified.find((n) => n.type === "call.missed")).toMatchObject({ recipients: [{ userId: w.u.B }] });
    const summaries = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.systemPayload).toMatchObject({ status: "NO_ANSWER" });
    expect(await h.container.deps.store.peekActive("CONVERSATION", w.direct)).toBeNull();
    expect((await h.container.deps.store.peekBusy([w.u.A!, w.u.B!])).size).toBe(0);
    // job chạy lại không đổi gì / không nhân đôi tóm tắt
    await h.container.recovery.ringTimeout(callId);
    await h.container.summary.post(callId);
    expect(await prisma.message.count({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } })).toBe(1);
  });

  it("job hết giờ với cuộc gọi đã có người trả lời (nhóm): chỉ người còn đổ chuông thành MISSED, cuộc gọi tiếp tục", async () => {
    const callId = await call(w.group);
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    // đẩy lùi thời điểm mời để coi như đã quá 45 s
    await prisma.callParticipant.updateMany({ where: { callId }, data: { invitedAt: new Date(Date.now() - 50_000) } });
    await h.container.recovery.ringTimeout(callId);
    const parts = await prisma.callParticipant.findMany({ where: { callId } });
    const byUser = Object.fromEntries(parts.map((p) => [p.userId, p.state]));
    expect(byUser).toMatchObject({ [w.u.A!]: "JOINING", [w.u.B!]: "JOINING", [w.u.C!]: "MISSED", [w.u.D!]: "MISSED" });
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ACTIVE");
    await drainOutbox(h);
    expect(h.eventsTo(w.u.C!, "call:cancelled")).toHaveLength(1);
    expect(h.notified.filter((n) => n.type === "call.missed").flatMap((n) => n.recipients.map((r) => r.userId)).sort()).toEqual([w.u.C, w.u.D].sort());
  });

  it("CL-06: worker chết khi đang RINGING, bật lại sau 90 s → recovery kết thúc NO_ANSWER, khoá Redis được nhả, không đổ chuông lại", async () => {
    const callId = await call(w.direct);
    // giả lập 90 giây trôi qua mà không job nào chạy
    await prisma.call.update({ where: { id: callId }, data: { startedAt: new Date(Date.now() - 90_000) } });
    const result = await h.container.recovery.recover();
    expect(result.timedOut).toBe(1);
    const ended = await prisma.call.findUnique({ where: { id: callId } });
    expect([ended!.status, ended!.endReason]).toEqual(["ENDED", "NO_ANSWER"]);
    expect(await h.container.deps.store.peekActive("CONVERSATION", w.direct)).toBeNull();
    expect((await h.container.deps.store.peekBusy([w.u.A!])).size).toBe(0);
    // call mới trong cùng hội thoại được phép ngay
    expect((await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() })).status).toBe(201);
  });

  it("recovery xếp call.reconcile cho cuộc ACTIVE lâu không đối soát; cuộc mới thì không", async () => {
    const callId = await call(w.direct);
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    expect((await h.container.recovery.recover()).reconcileQueued).toBe(0);
    await prisma.call.update({ where: { id: callId }, data: { answeredAt: new Date(Date.now() - 300_000), startedAt: new Date(Date.now() - 300_000) } });
    expect((await h.container.recovery.recover()).reconcileQueued).toBe(1);
    expect(h.reconcileScheduled.some((r) => r.callId === callId && r.delayMs === 0)).toBe(true);
  });

  it("cuộc gọi mồ côi: khoá Redis còn nhưng cuộc RINGING quá hạn không ai trong cuộc → người khác bấm gọi dọn cuộc cũ (FAILED) và tạo mới", async () => {
    const stale = await call(w.group);
    await prisma.call.update({ where: { id: stale }, data: { startedAt: new Date(Date.now() - 200_000) } });
    const res = await api("post", "/calls", w.u.C!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(res.status).toBe(201);
    expect(res.body.data.call.id).not.toBe(stale);
    expect((await prisma.call.findUnique({ where: { id: stale } }))!.endReason).toBe("FAILED");
  });
});
