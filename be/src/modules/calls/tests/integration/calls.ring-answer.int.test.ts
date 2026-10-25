import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedMeetingGroup, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { NoopMediaServer, setMediaServerForTests } from "../../../../infrastructure/media";
import { runtimeConfig } from "../../../../core/config/runtime-config";

const app = buildCallsApp();
const api = makeApi(app);

describe("calls — đổ chuông, trả lời, từ chối, huỷ (integration, Mongo memory replset)", () => {
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

  const startDirect = (mediaKind = "VIDEO", dev = deviceId("a1")) =>
    api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind, clientCallId: clientCallId(), deviceId: dev });

  it("gọi 1-1: 201 RINGING + token + khoá Redis; dispatch → callee nhận call:incoming, participant chuyển RINGING, push call.incoming", async () => {
    const res = await startDirect();
    expect(res.status).toBe(201);
    const { call, joined, token, livekitUrl } = res.body.data;
    expect([joined, call.status, call.mode, call.scopeType]).toEqual([false, "RINGING", "RING", "CONVERSATION"]);
    expect(token).toEqual(expect.any(String));
    expect(livekitUrl).toBe("ws://localhost:7880");
    expect(call.livekitRoom).toBeUndefined(); // không lộ tên phòng trong DTO
    expect(call.scope).toMatchObject({ kind: "DIRECT", title: "Người B" });
    expect(call.myActions).toMatchObject({ canCancel: true, canLeave: true, canAnswer: false });
    expect(await h.container.deps.store.peekActive("CONVERSATION", w.direct)).toBe(call.id);
    expect(h.media.callsOf("createRoom")).toHaveLength(1);

    const ran = await drainOutbox(h);
    expect(ran).toEqual(["call.signal-dispatch"]); // call.ring-timeout hẹn giờ 45 s — chưa tới hạn
    const incoming = h.eventsTo(w.u.B!, "call:incoming");
    expect(incoming).toHaveLength(1);
    expect(incoming[0]!.payload).toMatchObject({ callId: call.id, ring: true, call: { mediaKind: "VIDEO", scope: { title: "Người A" }, initiator: { id: w.u.A } } });
    expect(await prisma.callParticipant.findUnique({ where: { callId_userId: { callId: call.id, userId: w.u.B! } } })).toMatchObject({ state: "RINGING" });
    expect(h.notified.find((n) => n.type === "call.incoming")).toMatchObject({ recipients: [{ userId: w.u.B }], scope: { type: "CALL", id: call.id } });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: call.id, jobName: "call.ring-timeout", status: "PENDING" } })).toBe(1);
  });

  it("CL-09: retry cùng clientCallId → cùng callId, 200, token mới; đã ENDED thì trả DTO không token", async () => {
    const cid = clientCallId();
    const body = { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: cid, deviceId: deviceId() };
    const first = await api("post", "/calls", w.u.A!, body);
    const again = await api("post", "/calls", w.u.A!, body);
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body.data.call.id).toBe(first.body.data.call.id);
    expect(again.body.data.token).toEqual(expect.any(String));
    expect(await prisma.call.count({ where: { scopeId: w.direct } })).toBe(1);

    await api("post", `/calls/${first.body.data.call.id}/cancel`, w.u.A!);
    const afterEnd = await api("post", "/calls", w.u.A!, body);
    expect(afterEnd.status).toBe(200);
    expect(afterEnd.body.data.call.status).toBe("ENDED");
    expect(afterEnd.body.data.token).toBeUndefined();
  });

  it("trả lời: 200 + token, call ACTIVE; call:accepted tới người gọi, call:answered-elsewhere tới các máy của người trả lời", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);
    const b1 = deviceId("b1");
    const res = await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: b1 });
    expect(res.status).toBe(200);
    expect(res.body.data.call).toMatchObject({ status: "ACTIVE", myActions: { canLeave: true, canEnd: true, canAnswer: false } });
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } })).toMatchObject({ state: "JOINING", respondedDeviceId: b1 });

    await drainOutbox(h);
    expect(h.eventsTo(w.u.A!, "call:accepted")[0]!.payload).toMatchObject({ userId: w.u.B, originDeviceId: b1 });
    expect(h.eventsTo(w.u.B!, "call:answered-elsewhere")[0]!.payload).toMatchObject({ originDeviceId: b1 });
    expect(h.eventsTo(w.u.C!, "call:accepted")).toHaveLength(0); // người ngoài cuộc không nhận
    expect(h.notified.some((n) => n.type === "call.answered-elsewhere")).toBe(true);
    // trả lời lại từ cùng thiết bị: idempotent
    expect((await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: b1 })).status).toBe(200);
  });

  it("CL-02: hai thiết bị cùng người trả lời cùng lúc → một 200, một 409 CALL_006 answeredElsewhere; CL-03: từ chối trễ → ignored", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);
    const [r1, r2] = await Promise.all([
      api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: "device-b1-xxxx" }),
      api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: "device-b2-yyyy" }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error).toMatchObject({ code: "CALL_006", details: { answeredElsewhere: true } });
    const winnerDevice = r1.status === 200 ? "device-b1-xxxx" : "device-b2-yyyy";
    const loserDevice = winnerDevice === "device-b1-xxxx" ? "device-b2-yyyy" : "device-b1-xxxx";

    const late = await api("post", `/calls/${callId}/decline`, w.u.B!, { deviceId: loserDevice });
    expect(late.status).toBe(200);
    expect(late.body.data.ignored).toBe(true);
    expect(await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } })).toMatchObject({ state: "JOINING", respondedDeviceId: winnerDevice });
  });

  it("từ chối 1-1: call ENDED/DECLINED, outcome từng người, call:declined + call:ended; summary status DECLINED (đúng một tin)", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);
    const res = await api("post", `/calls/${callId}/decline`, w.u.B!, { deviceId: deviceId("b1") });
    expect(res.status).toBe(200);
    expect(res.body.data.call).toMatchObject({ status: "ENDED", endReason: "DECLINED" });
    const [pa, pb] = await Promise.all([
      prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.A! } } }),
      prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } }),
    ]);
    expect([pa!.outcome, pb!.outcome]).toEqual(["OUTGOING_UNANSWERED", "DECLINED"]);
    await drainOutbox(h);
    expect(h.eventsTo(w.u.A!, "call:declined")).toHaveLength(1);
    expect(h.eventsTo(w.u.A!, "call:ended")[0]!.payload).toMatchObject({ endReason: "DECLINED", durationSec: 0 });
    const messages = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.systemPayload).toMatchObject({ callId, status: "DECLINED", initiatorId: w.u.A });
    // khoá Redis đã nhả: gọi lại được
    expect((await startDirect("AUDIO")).status).toBe(201);
  });

  it("CL-10: người gọi huỷ khi đang đổ chuông → callee nhận call:cancelled + push call.cancelled + call.missed; tóm tắt CANCELLED; huỷ khi callee đã vào → 409 CALL_011", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await drainOutbox(h);
    const cancel = await api("post", `/calls/${callId}/cancel`, w.u.A!);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.call).toMatchObject({ status: "ENDED", endReason: "CANCELLED" });
    await drainOutbox(h);
    expect(h.eventsTo(w.u.B!, "call:cancelled")[0]!.payload).toMatchObject({ reason: "CANCELLED" });
    expect(h.notified.map((n) => n.type)).toEqual(expect.arrayContaining(["call.cancelled", "call.missed"]));
    expect(h.notified.find((n) => n.type === "call.missed")).toMatchObject({ recipients: [{ userId: w.u.B }] });
    const summary = await prisma.message.findFirst({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } });
    expect(summary!.systemPayload).toMatchObject({ status: "CANCELLED" });
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } }))!.outcome).toBe("MISSED");

    const c2 = await startDirect("AUDIO");
    const id2 = c2.body.data.call.id as string;
    await api("post", `/calls/${id2}/answer`, w.u.B!, { deviceId: deviceId() });
    const late = await api("post", `/calls/${id2}/cancel`, w.u.A!);
    expect([late.status, late.body.error.code]).toEqual([409, "CALL_011"]);
  });

  it("CL-04: gọi 1-1 người đang ở cuộc gọi khác → 201 ENDED/BUSY không token, callee có call.missed, tóm tắt BUSY", async () => {
    const other = await api("post", "/calls", w.u.B!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(other.status).toBe(201); // B đang gọi cả nhóm ⇒ B bận
    const res = await startDirect();
    expect(res.status).toBe(201);
    expect(res.body.data.call).toMatchObject({ status: "ENDED", endReason: "BUSY" });
    expect(res.body.data.token).toBeUndefined();
    const callId = res.body.data.call.id as string;
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B! } } }))!.outcome).toBe("BUSY");
    await drainOutbox(h);
    expect(h.notified.find((n) => n.type === "call.missed" && n.dedupeKey.includes(callId))).toMatchObject({ recipients: [{ userId: w.u.B }] });
    const summary = await prisma.message.findFirst({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } });
    expect(summary!.systemPayload).toMatchObject({ status: "BUSY" });
    // B gọi tiếp người khác khi đang bận → 409 CALL_004
    const busy = await api("post", "/calls", w.u.B!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect([busy.status, busy.body.error.code]).toEqual([409, "CALL_004"]);
  });

  it("CL-08: nhóm đang gọi, người thứ ba bấm gọi → joined:true (200), không call:incoming mới, cuộc gọi ACTIVE + call:accepted", async () => {
    const first = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = first.body.data.call.id as string;
    await drainOutbox(h);
    expect(h.emitted.filter((e) => e.event === "call:incoming")).toHaveLength(3); // B, C, D
    const before = h.emitted.length;

    const joined = await api("post", "/calls", w.u.C!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(joined.status).toBe(200);
    expect(joined.body.data).toMatchObject({ joined: true, call: { id: callId, status: "ACTIVE" }, token: expect.any(String) });
    await drainOutbox(h);
    expect(h.emitted.slice(before).filter((e) => e.event === "call:incoming")).toHaveLength(0);
    expect(h.eventsTo(w.u.A!, "call:accepted")).toHaveLength(1);
    expect(await prisma.call.count({ where: { scopeId: w.group } })).toBe(1);
  });

  it("nhóm lớn: chỉ đổ chuông tối đa ringMaxInvitees, phần còn lại nhận banner ring:false không push", async () => {
    const limited = installHarnessWithRing(2);
    const res = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(res.status).toBe(201);
    await drainOutbox(limited);
    const incoming = limited.emitted.filter((e) => e.event === "call:incoming");
    expect(incoming.map((e) => e.payload.ring).sort()).toEqual([false, true, true]);
    // OWNER/ADMIN được ưu tiên đổ chuông: D (ADMIN) luôn nằm trong nhóm đổ chuông
    expect(incoming.find((e) => (e.to as string[]).includes(w.u.D!))!.payload.ring).toBe(true);
    expect((limited.notified.find((n) => n.type === "call.incoming")!.recipients).length).toBe(2);
    expect(await prisma.callParticipant.count({ where: { callId: res.body.data.call.id } })).toBe(3); // người gọi + 2, người thứ 3 chưa là participant
    h = limited;
  });

  function installHarnessWithRing(ringMaxInvitees: number): CallsHarness {
    const base = installHarness();
    const c = base.container;
    const limits = c.deps.limits;
    c.deps.limits = async () => ({ ...(await limits()), ringMaxInvitees });
    // CallScopeService đọc giới hạn qua hàm riêng → dựng lại scope với giới hạn hẹp
    Object.assign(c.deps.scopes, { limits: () => Promise.resolve({ ringMaxInvitees, maxParticipants: 16 }) });
    return base;
  }

  it("CL-12: DM bị chặn hai chiều → 403 CALL_002; người ngoài hội thoại → 404 CALL_001; phạm vi MEETING → 400 CALL_013", async () => {
    await prisma.userBlock.create({ data: { blockerId: w.u.B!, blockedId: w.u.A! } });
    const { permissionService } = await import("../../../../core/permission");
    await permissionService.bumpVersion({ type: "CONVERSATION", id: w.direct });
    const blocked = await startDirect();
    expect([blocked.status, blocked.body.error.code]).toEqual([403, "CALL_002"]);

    const outsider = await api("post", "/calls", w.u.E!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect([outsider.status, outsider.body.error.code]).toEqual([404, "CALL_001"]);
    const meeting = await api("post", "/calls", w.u.A!, { scopeType: "MEETING", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(meeting.status).toBe(400); // schema chỉ nhận CONVERSATION|CHANNEL
  });

  it("CL-13: nhóm chat của cuộc họp đang LIVE → 409 CALL_007 kèm meetingId", async () => {
    const convId = await seedMeetingGroup(w, "LIVE");
    const res = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: convId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect([res.status, res.body.error.code]).toEqual([409, "CALL_007"]);
    expect(res.body.error.details.meetingId).toEqual(expect.any(String));
    const scheduled = await seedMeetingGroup(w, "SCHEDULED");
    const ok = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: scheduled, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    expect(ok.status).toBe(201);
  });

  it("GET /calls/:id: participant thấy chi tiết + myActions; thành viên hội thoại không phải participant xem được; người ngoài 404 CALL_005; GET /calls/active + /me/active-call", async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    const asC = await api("get", `/calls/${callId}`, w.u.C!);
    expect(asC.status).toBe(200);
    expect(asC.body.data.myActions).toMatchObject({ canAnswer: true, canDecline: true, canJoin: true });
    const outsider = await api("get", `/calls/${callId}`, w.u.E!);
    expect([outsider.status, outsider.body.error.code]).toEqual([404, "CALL_005"]);

    const active = await api("get", `/calls/active?scopeType=CONVERSATION&scopeId=${w.group}`, w.u.C!);
    expect(active.body.data.call.id).toBe(callId);
    const none = await api("get", `/calls/active?scopeType=CONVERSATION&scopeId=${w.direct}`, w.u.A!);
    expect(none.body.data.call).toBeNull();
    const denied = await api("get", `/calls/active?scopeType=CONVERSATION&scopeId=${w.group}`, w.u.E!);
    expect([denied.status, denied.body.error.code]).toEqual([404, "CALL_001"]);

    const mine = await api("get", "/me/active-call", w.u.A!);
    expect(mine.body.data).toMatchObject({ call: { id: callId }, myParticipant: { state: "JOINING", role: "INITIATOR" } });
    expect((await api("get", "/me/active-call", w.u.E!)).body.data.call).toBeNull();
  });

  it("CL-14: lịch sử — A gọi B nhỡ: /me/calls?filter=missed của B có 1 mục, của A không có; filter=all cả hai", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/cancel`, w.u.A!);
    const missedB = await api("get", "/me/calls?filter=missed", w.u.B!);
    expect(missedB.body.data).toHaveLength(1);
    expect(missedB.body.data[0]).toMatchObject({ callId, outcome: "MISSED", direction: "INCOMING", scope: { kind: "DIRECT", title: "Người A" } });
    expect((await api("get", "/me/calls?filter=missed", w.u.A!)).body.data).toHaveLength(0);
    const allA = await api("get", "/me/calls?filter=all", w.u.A!);
    expect(allA.body.data[0]).toMatchObject({ callId, outcome: "CANCELLED", direction: "OUTGOING" });
    expect(allA.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("CL-18: vượt 10 cuộc gọi/phút → 429 CALL_009 kèm retryAfterSeconds", async () => {
    let last: { status: number; body: { error?: { code: string; details: { retryAfterSeconds: number } } } } = { status: 0, body: {} };
    for (let i = 0; i < 11; i += 1) {
      last = await api("post", "/calls", w.u.E!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    }
    expect(last.status).toBe(429);
    expect(last.body.error!.code).toBe("CALL_009");
    expect(last.body.error!.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("CL-19: cờ voice tắt hoặc thiếu LiveKit → 503 CALL_012", async () => {
    const spy = jest.spyOn(runtimeConfig, "isFeatureEnabled").mockResolvedValue(false);
    const off = await startDirect();
    expect([off.status, off.body.error.code]).toEqual([503, "CALL_012"]);
    spy.mockRestore();
    setMediaServerForTests(new NoopMediaServer());
    const noMedia = await startDirect();
    expect([noMedia.status, noMedia.body.error.code]).toEqual([503, "CALL_012"]);
  });

  it("rời/kết thúc: 1-1 một bên rời → ENDED/COMPLETED, thời lượng đúng, tóm tắt COMPLETED; leave idempotent; token bị từ chối sau khi rời", async () => {
    const created = await startDirect();
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    await prisma.call.update({ where: { id: callId }, data: { answeredAt: new Date(Date.now() - 95_000) } });
    const leave = await api("post", `/calls/${callId}/leave`, w.u.A!);
    expect(leave.status).toBe(200);
    expect(leave.body.data.call).toMatchObject({ status: "ENDED", endReason: "COMPLETED" });
    expect(leave.body.data.call.durationSec).toBeGreaterThanOrEqual(95);
    expect((await api("post", `/calls/${callId}/leave`, w.u.A!)).status).toBe(200);
    await drainOutbox(h);
    const summary = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } });
    expect(summary).toHaveLength(1);
    expect(summary[0]!.systemPayload).toMatchObject({ status: "COMPLETED", durationSec: expect.any(Number) });
    const denied = await api("post", `/calls/${callId}/token`, w.u.B!);
    expect(denied.status).toBe(410);
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.A! } } }))!.outcome).toBe("COMPLETED");
  });

  it("end: nhóm — thành viên thường 403 CALL_015; người gọi hoặc ADMIN nhóm kết thúc cho mọi người (HOST_ENDED); người ngoài 403 CALL_014", async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    const denied = await api("post", `/calls/${callId}/end`, w.u.B!, { forEveryone: true });
    expect([denied.status, denied.body.error.code]).toEqual([403, "CALL_015"]);
    const outsider = await api("post", `/calls/${callId}/end`, w.u.E!, { forEveryone: true });
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "CALL_014"]);
    const ok = await api("post", `/calls/${callId}/end`, w.u.A!, { forEveryone: true });
    expect(ok.body.data.call).toMatchObject({ status: "ENDED", endReason: "HOST_ENDED" });
    expect(h.media.callsOf("deleteRoom").length).toBeGreaterThan(0);
  });

  it("nhóm: người gọi rời khi call đã ACTIVE không kết thúc; hết người → COMPLETED; còn 1 người → xếp reconcile chờ grace", async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    await api("post", `/calls/${callId}/decline`, w.u.C!, { deviceId: deviceId() });
    await api("post", `/calls/${callId}/decline`, w.u.D!, { deviceId: deviceId() });
    const leaveA = await api("post", `/calls/${callId}/leave`, w.u.A!);
    expect(leaveA.body.data.call.status).toBe("ACTIVE"); // B còn ở lại
    expect(h.reconcileScheduled.find((r) => r.callId === callId)).toMatchObject({ delayMs: 30_000 }); // CL-17: chờ reconnectGrace
    const leaveB = await api("post", `/calls/${callId}/leave`, w.u.B!);
    expect(leaveB.body.data.call).toMatchObject({ status: "ENDED", endReason: "COMPLETED" });
  });
});
