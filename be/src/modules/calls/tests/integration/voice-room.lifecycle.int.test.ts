import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import {
  buildVoiceApp,
  cleanupVoiceWorld,
  connect,
  disconnect,
  installPermissionPorts,
  lkEvent,
  MIC,
  resetPermissionSpy,
  roomOf,
  seedChannel,
  seedVoiceWorld,
  wireRevocation,
  type VoiceWorld,
} from "./voice-test-kit";
import { permissionService } from "../../../../core/permission";
import { prisma } from "../../../../infrastructure/database";
import { dispatchLiveKitEvent } from "../../../../infrastructure/media";
import { getChannelVoiceActivityReader } from "../../../../shared/ports/channel-voice-activity.port";
import { CallChannelVoiceActivityReader } from "../../services/channel-voice-activity.reader";

const app = buildVoiceApp();
const api = makeApi(app);

/** VR-06/VR-12 (be.md §10): vòng đời phòng — lưu trữ kênh/nhóm, thu hồi quyền, phòng trống, tin tóm tắt, tín hiệu số người. */
describe("p2-03 — vòng đời phòng thoại kênh (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  let ch: string;
  let callId: string;
  let audience: string[] = [];

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    audience = [];
    h = installHarness({ channelAudience: () => Promise.resolve(audience) });
    installPermissionPorts();
    w = await seedVoiceWorld();
    worlds.push(w);
    ch = await seedChannel(w);
    wireRevocation(h);
  });

  afterEach(async () => {
    resetPermissionSpy();
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const enter = (userId: string, channelId = ch) =>
    api("post", "/calls", userId, { scopeType: "CHANNEL", scopeId: channelId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
  async function startRoom(channelId = ch, joiners = ["B", "C"]): Promise<string> {
    const first = await enter(w.u.A!, channelId);
    const id = first.body.data.call.id as string;
    await connect(h, id, w.u.A!, [MIC]);
    for (const name of joiners) {
      await enter(w.u[name]!, channelId);
      await connect(h, id, w.u[name]!, [MIC]);
    }
    return id;
  }
  const callRow = () => prisma.call.findUnique({ where: { id: callId } });
  const part = (userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
  const summaries = (channelId = ch) => prisma.message.findMany({ where: { scopeType: "CHANNEL", scopeId: channelId, systemType: "CALL_SUMMARY" } });
  const activity = (channelId = ch) => h.emitted.filter((e) => e.event === "channel:voice-activity" && (e.payload as { channelId: string }).channelId === channelId);

  describe("lưu trữ kênh / nhóm (VR-06)", () => {
    it("kênh bị lưu trữ → phiên ENDED/ARCHIVED, phòng LiveKit bị xoá, người trong phòng nhận call:ended; token/vào lại bị từ chối; preview chỉ đọc", async () => {
      callId = await startRoom();
      await prisma.channel.update({ where: { id: ch }, data: { status: "ARCHIVED" } });
      redisStore.clear(); // cache meta kênh (60 s) — sản xuất được xoá bởi `invalidateChannelMetaCache` lúc lưu trữ

      // Trước khi listener kịp kết thúc phiên: token mới đã bị chặn (channel.read vẫn đúng với kênh lưu trữ nên phải kiểm riêng).
      const early = await api("post", `/calls/${callId}/token`, w.u.B!);
      expect([early.status, early.body.error.code]).toEqual([409, "CALL_018"]);

      // Đây chính là lời gọi của `channel.events` khi nhận `status-changed` ARCHIVED (channels/jobs/channel-events.consumer.ts).
      await permissionService.revokeScope({ scope: { type: "CHANNEL", id: ch }, userIds: [], reason: "ARCHIVED" });
      const call = await callRow();
      expect([call!.status, call!.endReason]).toEqual(["ENDED", "ARCHIVED"]);
      expect(h.media.callsOf("deleteRoom").map((c) => c.args[0])).toContain(roomOf(callId));
      expect(await h.container.deps.store.peekActive("CHANNEL", ch)).toBeNull();

      await drainOutbox(h);
      expect(h.eventsTo(w.u.B!, "call:ended")).toHaveLength(1);
      const inChannelRoom = h.emitted.filter((e) => e.event === "call:ended" && e.to === `ch:${ch}`);
      expect(inChannelRoom).toHaveLength(1);

      const join = await api("post", `/calls/${callId}/join`, w.u.D!, { deviceId: deviceId() });
      expect([join.status, join.body.error.code]).toEqual([410, "CALL_005"]);
      const fresh = await enter(w.u.D!);
      expect([fresh.status, fresh.body.error.code]).toEqual([409, "CALL_018"]);
      const preview = await api("get", `/channels/${ch}/voice`, w.u.D!);
      expect(preview.body.data).toMatchObject({ call: null, myActions: { canJoin: false, joinBlockedReason: "ARCHIVED" } });
    });

    it("nhóm bị lưu trữ mà không đi qua revokeScope (lưới an toàn): reconcile kết thúc phòng ARCHIVED", async () => {
      callId = await startRoom();
      await prisma.workspace.update({ where: { id: w.workspaceId }, data: { status: "ARCHIVED" } });
      await h.container.reconcile.reconcile(callId);
      const call = await callRow();
      expect([call!.status, call!.endReason]).toEqual(["ENDED", "ARCHIVED"]);
    });
  });

  describe("thu hồi quyền (VR-06)", () => {
    it("mất grant kênh riêng tư: người đó REMOVED + bị đá khỏi LiveKit, không vào lại; chủ phòng bị thu hồi → failover NGAY (delay 0)", async () => {
      const priv = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.A!, w.u.B!, w.u.C!] });
      callId = await startRoom(priv);

      await prisma.channelGrant.deleteMany({ where: { channelId: priv, userId: w.u.A } });
      await permissionService.revokeScope({ scope: { type: "CHANNEL", id: priv }, userIds: [w.u.A!], reason: "GRANT_REVOKED" });
      expect((await part(w.u.A!))!.state).toBe("REMOVED");
      expect(h.media.callsOf("removeParticipant").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.A]);
      expect((await part(w.u.B!))!.state).toBe("CONNECTED"); // người khác không bị ảnh hưởng
      expect((await callRow())!.status).toBe("ACTIVE");
      expect(h.failoverScheduled.map((f) => f.delayMs)).toEqual([0]); // chủ phòng đi: chuyển ngay, không chờ 30 s
      expect(await h.container.host.failover(callId)).toBe("CHANGED");
      expect((await callRow())!.hostId).toBe(w.u.B);

      const token = await api("post", `/calls/${callId}/token`, w.u.A!);
      expect(token.status).toBe(403);
      const rejoin = await api("post", `/calls/${callId}/join`, w.u.A!, { deviceId: deviceId() });
      expect([rejoin.status, rejoin.body.error.code]).toEqual([404, "CALL_001"]);
    });

    it("thành viên bị xoá khỏi nhóm (REMOVED) khi đang trong phòng kênh công khai → bị đá; đổi vai trò (ROLE_CHANGED) thì không", async () => {
      callId = await startRoom();
      await permissionService.revokeScope({ scope: { type: "CHANNEL", id: ch }, userIds: [w.u.C!], reason: "ROLE_CHANGED" });
      expect((await part(w.u.C!))!.state).toBe("CONNECTED");
      await permissionService.revokeScope({ scope: { type: "CHANNEL", id: ch }, userIds: [w.u.C!], reason: "REMOVED" });
      expect((await part(w.u.C!))!.state).toBe("REMOVED");
      expect((await callRow())!.status).toBe("ACTIVE");
    });
  });

  describe("phòng trống và tin tóm tắt (VR-12)", () => {
    const leaveEveryone = async () => {
      for (const n of ["C", "B", "A"]) await disconnect(h, callId, w.u[n]!);
    };

    it("mọi người rời, LiveKit đóng phòng (room_finished): ENDED/EMPTY, thời lượng tính tới lúc người cuối rời, ĐÚNG MỘT tin tóm tắt khi ≥ 60 s (kể cả sự kiện trùng)", async () => {
      callId = await startRoom();
      const started = new Date(Date.now() - 30 * 60_000);
      await prisma.call.update({ where: { id: callId }, data: { startedAt: started, answeredAt: started } });
      await leaveEveryone();
      await prisma.callParticipant.updateMany({ where: { callId }, data: { lastLeftAt: new Date(Date.now() - 5 * 60_000) } });

      expect(await dispatchLiveKitEvent(lkEvent("room_finished", roomOf(callId)))).toBe("PROCESSED");
      expect(await dispatchLiveKitEvent(lkEvent("room_finished", roomOf(callId)))).toBe("PROCESSED"); // trùng: idempotent
      const call = await callRow();
      expect([call!.status, call!.endReason]).toEqual(["ENDED", "EMPTY"]);
      expect(Math.abs(call!.durationSec! - 25 * 60)).toBeLessThanOrEqual(2); // 30 phút - 5 phút chờ tự đóng

      await drainOutbox(h);
      await drainOutbox(h);
      const found = await summaries();
      expect(found).toHaveLength(1);
      expect(found[0]!.systemPayload).toMatchObject({ callId, status: "COMPLETED", initiatorId: w.u.A });
      expect(Math.abs((found[0]!.systemPayload as { durationSec: number }).durationSec - 25 * 60)).toBeLessThanOrEqual(2);
      expect((found[0]!.systemPayload as { participantIds: string[] }).participantIds.sort()).toEqual([w.u.A, w.u.B, w.u.C].sort());
    });

    it("phòng ngắn hơn 60 s → KHÔNG có tin tóm tắt", async () => {
      callId = await startRoom();
      await leaveEveryone();
      await dispatchLiveKitEvent(lkEvent("room_finished", roomOf(callId)));
      const call = await callRow();
      expect([call!.status, call!.endReason, call!.durationSec! < 60]).toEqual(["ENDED", "EMPTY", true]);
      await drainOutbox(h);
      expect(await summaries()).toHaveLength(0);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: callId, type: "call.summary" } })).toBe(0);
    });

    it("mất webhook room_finished: reconcile chỉ đóng phòng khi trống ĐỦ 5 phút; còn người (kể cả đang JOINING) thì giữ", async () => {
      callId = await startRoom();
      const started = new Date(Date.now() - 20 * 60_000); // phòng đã mở lâu — thời gian trống tính từ lúc người cuối rời, không từ lúc mở
      await prisma.call.update({ where: { id: callId }, data: { startedAt: started, answeredAt: started } });
      await leaveEveryone();
      await h.container.reconcile.reconcile(callId);
      expect((await callRow())!.status).toBe("ACTIVE"); // mới trống — LiveKit còn `emptyTimeout`

      const longAgo = () => new Date(Date.now() - 301_000);
      await prisma.callParticipant.updateMany({ where: { callId }, data: { lastLeftAt: longAgo() } });
      // Một người đang kết nối lại (JOINING trong hạn) → phòng chưa "trống" dù người cuối rời đã quá 5 phút.
      await prisma.callParticipant.updateMany({ where: { callId, userId: w.u.C }, data: { state: "JOINING", joiningAt: new Date() } });
      await h.container.reconcile.reconcile(callId);
      expect([(await callRow())!.status, (await part(w.u.C!))!.state]).toEqual(["ACTIVE", "JOINING"]);

      // JOINING quá 30 s không thấy trong LiveKit → LEFT (đồng hồ "trống" bắt đầu từ lúc đó) → vẫn chưa đóng.
      await prisma.callParticipant.updateMany({ where: { callId, userId: w.u.C }, data: { joiningAt: new Date(Date.now() - 45_000) } });
      await h.container.reconcile.reconcile(callId);
      expect([(await callRow())!.status, (await part(w.u.C!))!.state]).toEqual(["ACTIVE", "LEFT"]);

      await prisma.callParticipant.updateMany({ where: { callId }, data: { lastLeftAt: longAgo() } });
      await h.container.reconcile.reconcile(callId);
      const call = await callRow();
      expect([call!.status, call!.endReason]).toEqual(["ENDED", "EMPTY"]);
    });

    it("phòng trống còn trong DB: người vào sau mở phiên MỚI làm chủ phòng; phiên cũ đóng EMPTY", async () => {
      callId = await startRoom();
      await leaveEveryone();
      // Quá 60 s kể từ lúc tạo (không còn được coi là phòng vừa mở): người vào sau không "vào" phòng trống mà mở phiên mới.
      const old = new Date(Date.now() - 120_000);
      await prisma.call.update({ where: { id: callId }, data: { startedAt: old, answeredAt: old } });
      const fresh = await enter(w.u.D!);
      expect([fresh.status, fresh.body.data.call.id === callId, fresh.body.data.call.hostId]).toEqual([201, false, w.u.D]);
      expect((await callRow())!.endReason).toBe("EMPTY");
      expect(await prisma.call.count({ where: { scopeId: ch, status: { not: "ENDED" } } })).toBe(1);
    });
  });

  describe("số người trong phòng cho danh sách kênh", () => {
    it("kênh công khai: channel:voice-activity tới room ws:{workspaceId} mỗi lần số người đổi và {callId:null,count:0} khi phòng kết thúc", async () => {
      callId = await startRoom(ch, ["B"]);
      await drainOutbox(h);
      const toWs = activity().filter((e) => e.target === "room" && e.to === `ws:${w.workspaceId}`);
      expect(toWs.length).toBeGreaterThan(0);
      expect(toWs[toWs.length - 1]!.payload).toMatchObject({ channelId: ch, workspaceId: w.workspaceId, voice: { callId, count: 2 } });
      expect(activity().every((e) => e.target === "room")).toBe(true); // không liệt kê từng thành viên công khai

      await disconnect(h, callId, w.u.B!);
      await drainOutbox(h);
      expect(activity().pop()!.payload).toMatchObject({ voice: { callId, count: 1 } });

      await h.container.ends.endCall(callId, "HOST_ENDED", w.u.A!);
      await drainOutbox(h);
      expect(activity().pop()!.payload).toMatchObject({ voice: { callId: null, count: 0 } });
    });

    it("kênh riêng tư: chỉ người đọc được kênh nhận (unicast), không bao giờ vào room ws:", async () => {
      audience = [];
      const priv = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.A!, w.u.B!] });
      audience = [w.u.A!, w.u.B!];
      callId = await startRoom(priv, ["B"]);
      await drainOutbox(h);
      const events = activity(priv);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.target === "users")).toBe(true);
      expect(events[events.length - 1]!.to).toEqual([w.u.A, w.u.B]);
      expect(events[events.length - 1]!.payload).toMatchObject({ voice: { callId, count: 2 } });
      expect(h.emitted.some((e) => e.to === `ws:${w.workspaceId}` && e.event === "channel:voice-activity")).toBe(false);
    });

    it("cổng đọc cho danh sách kênh: chỉ kênh đang có người; đếm CONNECTED, không đếm JOINING/LEFT", async () => {
      const other = await seedChannel(w);
      callId = await startRoom(ch, ["B"]);
      await enter(w.u.C!); // JOINING
      // Cổng do `registerCallsModule()` đăng ký (nối dây thật), không phải test tự dựng — `channels` đọc đúng cổng này qua `shared/ports`.
      const reader = getChannelVoiceActivityReader();
      expect(reader).toBeInstanceOf(CallChannelVoiceActivityReader);
      if (!reader) throw new Error("cổng chưa được đăng ký");
      const map = await reader.activityOf([ch, other]);
      expect([...map.keys()]).toEqual([ch]);
      expect(map.get(ch)).toEqual({ callId, count: 2 });

      await disconnect(h, callId, w.u.B!);
      await disconnect(h, callId, w.u.A!);
      expect((await reader.activityOf([ch])).size).toBe(0); // không còn ai kết nối → không hiện badge
      expect((await reader.activityOf([])).size).toBe(0);
    });
  });
});
