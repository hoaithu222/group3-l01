import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import { buildVoiceApp, cleanupVoiceWorld, connect, disconnect, installPermissionPorts, MIC, resetPermissionSpy, seedChannel, seedVoiceWorld, type VoiceWorld } from "./voice-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildVoiceApp();
const api = makeApi(app);

/** VR-01 (be.md §10): xem trước phòng — không tạo phiên, không cấp token; riêng tư; chỗ còn lại; lý do không vào được. */
describe("p2-03 — preview phòng thoại kênh (integration, Mongo memory replset)", () => {
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
    installPermissionPorts();
    w = await seedVoiceWorld(["G", "H", "I"]);
    worlds.push(w);
    ch = await seedChannel(w, { name: "phong-hoc-nhom" });
  });

  afterEach(async () => {
    resetPermissionSpy();
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const preview = (userId: string, channelId = ch) => api("get", `/channels/${channelId}/voice`, userId);
  const enter = (userId: string, channelId = ch) =>
    api("post", "/calls", userId, { scopeType: "CHANNEL", scopeId: channelId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
  async function join(name: string, channelId = ch): Promise<string> {
    const res = await enter(w.u[name]!, channelId);
    const id = res.body.data.call.id as string;
    await connect(h, id, w.u[name]!, [MIC]);
    return id;
  }

  it("VR-01: phòng trống → call null, đủ 8 chỗ, vào được; chỉ XEM — không tạo phiên, không tạo phòng LiveKit, không cấp token", async () => {
    const res = await preview(w.u.B!);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      channel: { id: ch, name: "phong-hoc-nhom", voiceSettings: { allowVideo: true, maxParticipants: 8 } },
      call: null,
      participants: [],
      seatsLeft: 8,
      limits: { maxParticipants: 8, maxScreenShares: 1 },
      myActions: { canJoin: true },
    });
    expect(res.body.data.token).toBeUndefined();
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(0);
    expect(h.media.callsOf("createRoom")).toHaveLength(0);
    expect(await h.container.deps.store.peekActive("CHANNEL", ch)).toBeNull();
    expect((await h.container.deps.store.peekBusy([w.u.B!])).size).toBe(0);
  });

  it("phòng có người: danh sách công khai (tên, chủ phòng, giơ tay, chia sẻ màn hình, quyền mic) theo thứ tự vào; JOINING chưa hiện nhưng chiếm chỗ", async () => {
    const callId = await join("A");
    await new Promise((r) => setTimeout(r, 5));
    await join("C");
    await enter(w.u.B!); // JOINING, chưa kết nối
    await api("post", `/calls/${callId}/hand`, w.u.C!, { raised: true });
    await api("post", `/calls/${callId}/screen-share`, w.u.C!, { on: true });
    const version = (await prisma.call.findUnique({ where: { id: callId } }))!.version;
    await api("post", `/calls/${callId}/host/block-audio`, w.u.A!, { targetUserId: w.u.C, expectedVersion: version });

    const res = await preview(w.u.D!);
    const data = res.body.data as { call: Record<string, unknown>; participants: Array<Record<string, unknown>>; seatsLeft: number; myActions: unknown };
    expect(data.call).toMatchObject({ id: callId, hostId: w.u.A, version: expect.any(Number), startedAt: expect.any(String) });
    expect(data.participants.map((p) => p.userId)).toEqual([w.u.A, w.u.C]); // B (JOINING) chưa hiện
    expect(data.participants[0]).toMatchObject({ name: "Người A", isHost: true, micEnabled: true, handRaisedAt: null, sharingScreen: false });
    expect(data.participants[1]).toMatchObject({ name: "Người C", isHost: false, micEnabled: false, sharingScreen: true });
    expect(data.participants[1]!.handRaisedAt).toEqual(expect.any(String));
    expect(data.seatsLeft).toBe(5); // 8 - (A, C, B đang vào)
    expect(data.myActions).toEqual({ canJoin: true });
    expect(JSON.stringify(data)).not.toContain("livekit"); // không lộ tên phòng media/token
  });

  it("phiên còn trong DB nhưng không còn ai → coi như chưa có phòng (call null)", async () => {
    const callId = await join("A");
    await disconnect(h, callId, w.u.A!);
    const res = await preview(w.u.B!);
    expect(res.body.data).toMatchObject({ call: null, participants: [], seatsLeft: 8, myActions: { canJoin: true } });
  });

  it("kênh riêng tư: chỉ người có grant xem được; OWNER/ADMIN nhóm KHÔNG có grant cũng 404 CALL_001 (giống kênh không tồn tại)", async () => {
    const priv = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.B!, w.u.C!] });
    expect((await preview(w.u.B!, priv)).status).toBe(200);
    const owner = await preview(w.u.A!, priv); // A là OWNER nhóm nhưng không có grant kênh
    expect([owner.status, owner.body.error.code]).toEqual([404, "CALL_001"]);
    const stranger = await preview(w.u.D!, priv);
    const missing = await preview(w.u.D!, "64b0f0f0f0f0f0f0f0f0f0f0");
    expect([stranger.status, stranger.body.error.code]).toEqual([missing.status, missing.body.error.code]);
    // Người ngoài không thấy ai đang trong phòng riêng tư.
    await join("B", priv);
    expect((await preview(w.u.D!, priv)).status).toBe(404);
    expect((await preview(w.u.C!, priv)).body.data.participants.map((p: { userId: string }) => p.userId)).toEqual([w.u.B]);
  });

  it("kênh không phải VOICE → 400 CALL_013; không đăng nhập → 401", async () => {
    const text = await seedChannel(w, { type: "TEXT" });
    const res = await preview(w.u.B!, text);
    expect([res.status, res.body.error.code]).toEqual([400, "CALL_013"]);
    const anon = await (await import("supertest")).default(app).get(`/api/v1/channels/${ch}/voice`);
    expect(anon.status).toBe(401);
  });

  it("đủ 8 người: seatsLeft 0, người ngoài canJoin=false/FULL; người đang ở trong phòng vẫn canJoin (chuyển thiết bị)", async () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    for (const n of names) await join(n);
    const outsider = await preview(w.u.I!);
    expect(outsider.body.data).toMatchObject({ seatsLeft: 0, myActions: { canJoin: false, joinBlockedReason: "FULL" } });
    expect((await preview(w.u.B!)).body.data.myActions).toEqual({ canJoin: true });
    expect((await preview(w.u.B!)).body.data.participants).toHaveLength(8);
  });

  it("người bị mời ra khỏi phiên này → joinBlockedReason REMOVED; kênh/nhóm đã lưu trữ → ARCHIVED (chỉ đọc)", async () => {
    const callId = await join("A");
    await join("B");
    const version = (await prisma.call.findUnique({ where: { id: callId } }))!.version;
    await api("post", `/calls/${callId}/host/remove`, w.u.A!, { targetUserId: w.u.B, expectedVersion: version });
    expect((await preview(w.u.B!)).body.data.myActions).toEqual({ canJoin: false, joinBlockedReason: "REMOVED" });
    expect((await preview(w.u.C!)).body.data.myActions).toEqual({ canJoin: true });

    await prisma.channel.update({ where: { id: ch }, data: { status: "ARCHIVED" } });
    redisStore.clear(); // cache meta kênh
    const archived = await preview(w.u.C!);
    expect(archived.status).toBe(200); // vẫn xem được (chỉ đọc)
    expect(archived.body.data.myActions).toEqual({ canJoin: false, joinBlockedReason: "ARCHIVED" });
    expect(archived.body.data.participants.map((p: { userId: string }) => p.userId)).toEqual([w.u.A]);
  });
});
