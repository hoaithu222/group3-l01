import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import { buildVoiceApp, cleanupVoiceWorld, connect, grantOf, roomOf, seedChannel, seedVoiceWorld, type VoiceWorld } from "./voice-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildVoiceApp();
const api = makeApi(app);

/** VR-03/VR-05/VR-06 (be.md §10): tạo/vào phòng thoại kênh, trần 8 chỗ, chuyển thiết bị/cuộc gọi, lỗi theo loại kênh. */
describe("p2-03 — vào phòng thoại kênh (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  let ch: string;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    w = await seedVoiceWorld(["G", "H", "I"]);
    worlds.push(w);
    ch = await seedChannel(w);
  });

  afterEach(async () => {
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const enterRoom = (userId: string, channelId = ch, extra: Record<string, unknown> = {}) =>
    api("post", "/calls", userId, { scopeType: "CHANNEL", scopeId: channelId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId(), ...extra });
  const participant = (callId: string, userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });

  it("người đầu tiên vào tạo phòng ROOM ACTIVE và là chủ phòng; LiveKit nhận emptyTimeout 300 s, trần 8; token KHÔNG có quyền chia sẻ màn hình/quản trị", async () => {
    const res = await enterRoom(w.u.A!);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ joined: false, call: { scopeType: "CHANNEL", mode: "ROOM", status: "ACTIVE", hostId: w.u.A } });
    const callId = res.body.data.call.id as string;

    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect(call).toMatchObject({ mode: "ROOM", status: "ACTIVE", hostId: w.u.A, activeKey: `CHANNEL:${ch}`, livekitRoom: roomOf(callId) });
    expect(call!.answeredAt).not.toBeNull(); // phòng ACTIVE ngay khi tạo (không đổ chuông)
    expect((await participant(callId, w.u.A!))!.role).toBe("HOST");
    expect(h.media.callsOf("createRoom")[0]!.args[0]).toMatchObject({ name: roomOf(callId), emptyTimeoutSeconds: 300, maxParticipants: 8 });

    const grant = grantOf(res.body.data.token as string);
    expect(grant.canPublishSources).toEqual(expect.arrayContaining(["microphone", "camera"]));
    expect(grant.canPublishSources).not.toContain("screen_share"); // chia sẻ màn hình chỉ sau khi xin slot ở server
    expect(grant.roomAdmin).toBeFalsy();
    expect(grant.room).toBe(roomOf(callId));
    expect(h.eventsTo(w.u.B!, "call:incoming")).toHaveLength(0); // không đổ chuông
  });

  it("người thứ hai vào phiên đang có (POST /calls và POST /calls/:id/join), không tạo phiên mới; retry cùng clientCallId idempotent", async () => {
    const first = await enterRoom(w.u.A!);
    const callId = first.body.data.call.id as string;
    const second = await enterRoom(w.u.B!);
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ joined: true, call: { id: callId } });
    expect((await participant(callId, w.u.B!))!.role).toBe("MEMBER");

    const third = await api("post", `/calls/${callId}/join`, w.u.C!, { deviceId: deviceId() });
    expect(third.status).toBe(200);
    expect(third.body.data.call.id).toBe(callId);
    expect(third.body.data.token).toEqual(expect.any(String));

    const cid = clientCallId();
    const dev = deviceId();
    const a = await api("post", "/calls", w.u.D!, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: cid, deviceId: dev });
    const b = await api("post", "/calls", w.u.D!, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: cid, deviceId: dev });
    expect(a.body.data.call.id).toBe(b.body.data.call.id);
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(1);
  });

  it("hai người vào cùng lúc khi chưa có phòng → đúng MỘT phiên, đúng một chủ phòng", async () => {
    const [a, b] = await Promise.all([enterRoom(w.u.A!), enterRoom(w.u.B!)]);
    expect([a.status, b.status].every((s) => s === 200 || s === 201)).toBe(true);
    expect(a.body.data.call.id).toBe(b.body.data.call.id);
    const callId = a.body.data.call.id as string;
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(1);
    const parts = await prisma.callParticipant.findMany({ where: { callId } });
    expect(parts.filter((p) => p.role === "HOST")).toHaveLength(1);
    expect(parts.map((p) => p.userId).sort()).toEqual([w.u.A, w.u.B].sort());
  });

  it("VR-03: 9 người vào cùng lúc, trần 8 → đúng 8 vào được, 1 người 409 CALL_008 và khoá bận được nhả; JOINING treo 30 s giải phóng chỗ", async () => {
    const users = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((n) => w.u[n]!);
    const results = await Promise.all(users.map((u) => enterRoom(u)));
    const ok = results.filter((r) => r.status === 200 || r.status === 201);
    const full = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(8);
    expect(full).toHaveLength(1);
    expect(full[0]!.body.error.code).toBe("CALL_008");

    const callId = ok[0]!.body.data.call.id as string;
    expect(await prisma.callParticipant.count({ where: { callId } })).toBe(8);
    const loser = users[results.indexOf(full[0]!)]!;
    expect((await h.container.deps.store.peekBusy([loser])).size).toBe(0); // không kẹt "đang trong cuộc gọi khác"

    // Một người vào JOINING nhưng không bao giờ kết nối được (quá 30 s) → reconcile giải phóng chỗ.
    const stuck = users.find((u) => u !== loser)!;
    await prisma.callParticipant.update({ where: { callId_userId: { callId, userId: stuck } }, data: { joiningAt: new Date(Date.now() - 45_000) } });
    await h.container.reconcile.reconcile(callId);
    expect((await participant(callId, stuck))!.state).toBe("LEFT");
    const retry = await enterRoom(loser);
    expect([retry.status, retry.body.data.joined]).toEqual([200, true]);
    expect(await prisma.callParticipant.count({ where: { callId, state: { in: ["JOINING", "CONNECTED"] } } })).toBe(8);
  }, 60_000);

  it("trần chỗ theo voiceSettings.maxParticipants của kênh (thấp hơn 8) — người thứ 3 vào phòng 2 chỗ nhận CALL_008", async () => {
    const small = await seedChannel(w, { voiceSettings: { allowVideo: true, maxParticipants: 2 } });
    expect((await enterRoom(w.u.A!, small)).status).toBe(201);
    expect((await enterRoom(w.u.B!, small)).status).toBe(200);
    const third = await enterRoom(w.u.C!, small);
    expect([third.status, third.body.error.code]).toEqual([409, "CALL_008"]);
    expect(h.media.callsOf("createRoom").find((c) => (c.args[0] as { maxParticipants: number }).maxParticipants === 2)).toBeDefined();
  });

  it("allowVideo=false: token không có quyền camera", async () => {
    const audioOnly = await seedChannel(w, { voiceSettings: { allowVideo: false, maxParticipants: 8 } });
    const res = await enterRoom(w.u.A!, audioOnly);
    expect(grantOf(res.body.data.token as string).canPublishSources).toEqual(["microphone"]);
  });

  it("VR-05: đã ở phòng trên máy khác — không force → 409 CALL_004 sameCallOtherDevice; force → đá máy cũ (removeParticipant) và cấp token cho máy mới", async () => {
    const dev1 = deviceId("dev1");
    const dev2 = deviceId("dev2");
    const first = await api("post", "/calls", w.u.B!, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: dev1 });
    const callId = first.body.data.call.id as string;
    await connect(h, callId, w.u.B!);

    const blocked = await api("post", `/calls/${callId}/join`, w.u.B!, { deviceId: dev2 });
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CALL_004"]);
    expect(blocked.body.error.details).toMatchObject({ sameCallOtherDevice: true });
    expect(h.media.callsOf("removeParticipant")).toHaveLength(0);

    const moved = await api("post", `/calls/${callId}/join`, w.u.B!, { deviceId: dev2, force: true });
    expect(moved.status).toBe(200);
    expect(moved.body.data.token).toEqual(expect.any(String));
    expect(h.media.callsOf("removeParticipant").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.B]);
    expect((await participant(callId, w.u.B!))!.respondedDeviceId).toBe(dev2);
    expect(await prisma.callParticipant.count({ where: { callId, userId: w.u.B } })).toBe(1); // vẫn MỘT participant

    // Cùng thiết bị gọi lại: chỉ cấp token mới, không đá ai.
    const removeCalls = h.media.callsOf("removeParticipant").length;
    const again = await api("post", `/calls/${callId}/join`, w.u.B!, { deviceId: dev2 });
    expect(again.status).toBe(200);
    expect(h.media.callsOf("removeParticipant")).toHaveLength(removeCalls);
  });

  it("đang trong cuộc gọi khác — không force → 409 CALL_004 kèm activeCall; force → rời cuộc gọi cũ (kết thúc 1-1) rồi vào phòng", async () => {
    const dm = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const dmId = dm.body.data.call.id as string;
    await api("post", `/calls/${dmId}/answer`, w.u.B!, { deviceId: deviceId() });

    const blocked = await enterRoom(w.u.A!);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CALL_004"]);
    expect(blocked.body.error.details.activeCall).toMatchObject({ id: dmId, scopeType: "CONVERSATION" });
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(0); // không để lại phiên/khoá rác

    const forced = await enterRoom(w.u.A!, ch, { force: true });
    expect([forced.status, forced.body.data.call.scopeType]).toEqual([201, "CHANNEL"]);
    expect((await prisma.call.findUnique({ where: { id: dmId } }))!.status).toBe("ENDED");
    expect((await h.container.deps.store.peekBusy([w.u.A!])).get(w.u.A!)).toBe(forced.body.data.call.id);
  });

  it("kênh không phải VOICE → 400 CALL_013; kênh riêng tư không có grant → 404 CALL_001 (trung tính); kênh đã lưu trữ → 409 CALL_018", async () => {
    const text = await seedChannel(w, { type: "TEXT" });
    const notVoice = await enterRoom(w.u.A!, text);
    expect([notVoice.status, notVoice.body.error.code]).toEqual([400, "CALL_013"]);

    const priv = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.A!, w.u.B!] });
    const hidden = await enterRoom(w.u.C!, priv);
    expect([hidden.status, hidden.body.error.code]).toEqual([404, "CALL_001"]);
    const missing = await enterRoom(w.u.C!, "64b0f0f0f0f0f0f0f0f0f0f0");
    expect([missing.status, missing.body.error.code]).toEqual([404, "CALL_001"]); // không phân biệt "không tồn tại" và "không thấy"
    expect((await enterRoom(w.u.A!, priv)).status).toBe(201);
    expect((await enterRoom(w.u.B!, priv)).status).toBe(200);

    const archived = await seedChannel(w, { status: "ARCHIVED" });
    const blocked = await enterRoom(w.u.A!, archived);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CALL_018"]);
    expect(await prisma.call.count({ where: { scopeId: archived } })).toBe(0);

    await prisma.workspace.update({ where: { id: w.workspaceId }, data: { status: "ARCHIVED" } });
    const wsArchived = await enterRoom(w.u.C!, ch);
    expect([wsArchived.status, wsArchived.body.error.code]).toEqual([409, "CALL_018"]);
  });

  it("cờ voice tắt → 503 CALL_012 (client ẩn kênh VOICE)", async () => {
    const { runtimeConfig } = await import("../../../../core/config/runtime-config");
    const spy = jest.spyOn(runtimeConfig, "isFeatureEnabled").mockResolvedValue(false);
    const res = await enterRoom(w.u.A!);
    spy.mockRestore();
    expect([res.status, res.body.error.code]).toEqual([503, "CALL_012"]);
  });
});
