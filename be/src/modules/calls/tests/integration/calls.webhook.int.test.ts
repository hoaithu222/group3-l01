import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { dispatchLiveKitEvent, type NormalizedLiveKitEvent } from "../../../../infrastructure/media";
import "../../jobs/call.jobs"; // side-effect: đăng ký handler webhook LiveKit tiền tố `call_`

const app = buildCallsApp();
const api = makeApi(app);

function event(type: string, room: string, identity?: string, id = `evt-${Math.random().toString(36).slice(2)}`): NormalizedLiveKitEvent {
  return {
    id,
    type,
    roomName: room,
    createdAt: new Date().toISOString(),
    room: null,
    participant: identity ? { identity, sid: `PA_${identity.slice(-4)}`, state: "ACTIVE", joinedAt: null } : null,
    track: null,
    egress: null,
  };
}

describe("calls — webhook LiveKit và reconcile (integration, Mongo memory replset)", () => {
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

  const startAnswered = async (scopeId = w.direct) => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    return { callId, room: `call_${callId}` };
  };
  const stateOf = async (callId: string, userId: string) => (await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } }))!.state;

  it("CL-07: webhook trùng và sai thứ tự (left trước joined) — trạng thái cuối khớp listParticipants, không tóm tắt lặp", async () => {
    const { callId, room } = await startAnswered();
    // sự thật ở LiveKit: cả hai đang ở trong phòng; nhưng sự kiện đến sai thứ tự và bị trùng
    h.media.join(room, { identity: w.u.A! });
    h.media.join(room, { identity: w.u.B! });
    const left = event("participant_left", room, w.u.B!, "evt-left-1");
    const joined = event("participant_joined", room, w.u.B!, "evt-join-1");
    expect(await dispatchLiveKitEvent(left)).toBe("PROCESSED");
    expect(await dispatchLiveKitEvent(joined)).toBe("PROCESSED");
    expect(await dispatchLiveKitEvent(joined)).toBe("PROCESSED"); // trùng: idempotent
    await dispatchLiveKitEvent(event("participant_joined", room, w.u.A!));

    await h.container.reconcile.reconcile(callId); // ghi đè theo listParticipants
    expect(await stateOf(callId, w.u.A!)).toBe("CONNECTED");
    expect(await stateOf(callId, w.u.B!)).toBe("CONNECTED");
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ACTIVE");
    expect(h.reconcileScheduled.filter((r) => r.callId === callId).length).toBeGreaterThan(0);
    await drainOutbox(h);
    expect(await prisma.message.count({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } })).toBe(0);
    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect(call!.peakParticipants).toBe(2);
    expect(call!.lastReconciledAt).not.toBeNull();
  });

  it("participant_joined của callee khi call còn RINGING (không qua answer) → ACTIVE; identity lạ bị đá khỏi phòng", async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    const room = `call_${callId}`;
    await dispatchLiveKitEvent(event("participant_joined", room, w.u.B!));
    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect(call!.status).toBe("ACTIVE");
    expect(await stateOf(callId, w.u.B!)).toBe("CONNECTED");

    const stranger = w.u.F!;
    h.media.join(room, { identity: stranger });
    expect(await dispatchLiveKitEvent(event("participant_joined", room, stranger))).toBe("PROCESSED");
    expect(h.media.callsOf("removeParticipant").some((c) => c.args[1] === stranger)).toBe(true);
    expect(await prisma.callParticipant.count({ where: { callId, userId: stranger } })).toBe(0);
  });

  it("CL-16: 1-1 đang gọi, một bên mất mạng hẳn (participant_left + reconcile) → ENDED/COMPLETED, thời lượng đúng, khoá nhả", async () => {
    const { callId, room } = await startAnswered();
    h.media.join(room, { identity: w.u.A! });
    h.media.join(room, { identity: w.u.B! });
    await h.container.reconcile.reconcile(callId);
    await prisma.call.update({ where: { id: callId }, data: { answeredAt: new Date(Date.now() - 62_000) } });

    h.media.leave(room, w.u.B!); // B mất mạng: LiveKit thấy B rời
    await dispatchLiveKitEvent(event("participant_left", room, w.u.B!));
    await h.container.reconcile.reconcile(callId);
    const ended = await prisma.call.findUnique({ where: { id: callId } });
    expect([ended!.status, ended!.endReason]).toEqual(["ENDED", "COMPLETED"]);
    expect(ended!.durationSec).toBeGreaterThanOrEqual(62);
    expect(await h.container.deps.store.peekActive("CONVERSATION", w.direct)).toBeNull();
    await drainOutbox(h);
    expect(h.eventsTo(w.u.A!, "call:ended")).toHaveLength(1);
    expect(await prisma.message.count({ where: { scopeType: "CONVERSATION", scopeId: w.direct, systemType: "CALL_SUMMARY" } })).toBe(1);
  });

  it("room_finished: call ACTIVE → COMPLETED; call còn RINGING → NO_ANSWER; call đã ENDED → không đổi gì", async () => {
    const { callId, room } = await startAnswered();
    expect(await dispatchLiveKitEvent(event("room_finished", room))).toBe("PROCESSED");
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.endReason).toBe("COMPLETED");
    expect(await dispatchLiveKitEvent(event("room_finished", room))).toBe("PROCESSED");
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.endReason).toBe("COMPLETED");

    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const ringing = created.body.data.call.id as string;
    await dispatchLiveKitEvent(event("room_finished", `call_${ringing}`));
    expect((await prisma.call.findUnique({ where: { id: ringing } }))!.endReason).toBe("NO_ANSWER");
  });

  it("phòng không thuộc call_/không có cuộc gọi tương ứng → IGNORED; loại sự kiện không quan tâm → IGNORED", async () => {
    expect(await dispatchLiveKitEvent(event("participant_joined", "call_64b0f0f0f0f0f0f0f0f0f0f0", w.u.A!))).toBe("IGNORED");
    const { room } = await startAnswered();
    expect(await dispatchLiveKitEvent(event("track_published", room, w.u.A!))).toBe("IGNORED");
  });

  it("reconcile: JOINING quá 30 s không thấy trong LiveKit → LEFT; còn trong hạn thì giữ; CONNECTED biến mất → LEFT", async () => {
    const { callId, room } = await startAnswered();
    h.media.join(room, { identity: w.u.A! });
    // B vừa trả lời (JOINING) nhưng chưa kết nối
    await h.container.reconcile.reconcile(callId);
    expect(await stateOf(callId, w.u.B!)).toBe("JOINING");
    await prisma.callParticipant.update({ where: { callId_userId: { callId, userId: w.u.B! } }, data: { joiningAt: new Date(Date.now() - 45_000) } });
    await h.container.reconcile.reconcile(callId);
    expect(await stateOf(callId, w.u.B!)).toBe("LEFT");
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ENDED"); // 1-1 chỉ còn A ⇒ kết thúc
  });

  it("endCall khi LiveKit lỗi vẫn kết thúc + xếp reconcile dọn phòng (non-fatal)", async () => {
    const { callId } = await startAnswered();
    h.media.failNext("deleteRoom");
    await h.container.ends.endCall(callId, "HOST_ENDED", w.u.A!);
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ENDED");
    expect(h.reconcileScheduled.some((r) => r.callId === callId)).toBe(true);
  });
});
