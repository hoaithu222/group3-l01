import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import {
  buildVoiceApp,
  CAM,
  cleanupVoiceWorld,
  connect,
  disconnect,
  grantOf,
  installPermissionPorts,
  lkEvent,
  MIC,
  resetPermissionSpy,
  roomOf,
  SCREEN,
  seedChannel,
  seedVoiceWorld,
  type PermissionSpy,
  type VoiceWorld,
} from "./voice-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { dispatchLiveKitEvent } from "../../../../infrastructure/media";

const app = buildVoiceApp();
const api = makeApi(app);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** VR-06/VR-08/VR-09/VR-10/VR-11 (be.md §10): điều khiển của chủ phòng, giơ tay, slot chia sẻ màn hình. */
describe("p2-03 — chủ phòng, giơ tay, chia sẻ màn hình (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  let ch: string;
  let callId: string;
  let spy: PermissionSpy;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    spy = installPermissionPorts();
    w = await seedVoiceWorld();
    worlds.push(w);
    ch = await seedChannel(w);
  });

  afterEach(async () => {
    resetPermissionSpy();
    await cleanupVoiceWorld(worlds.splice(0));
    redisStore.clear();
  });

  const enter = (userId: string, channelId = ch) =>
    api("post", "/calls", userId, { scopeType: "CHANNEL", scopeId: channelId, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });

  /** A tạo phòng (chủ phòng, có mic); mỗi người trong `joiners` vào và kết nối LiveKit (B có mic+camera). */
  async function startRoom(joiners: string[] = ["B", "C"], channelId = ch): Promise<string> {
    const first = await enter(w.u.A!, channelId);
    const id = first.body.data.call.id as string;
    await connect(h, id, w.u.A!, [MIC]);
    for (const name of joiners) {
      await enter(w.u[name]!, channelId);
      await connect(h, id, w.u[name]!, name === "B" ? [MIC, CAM] : [MIC]);
    }
    return id;
  }
  const versionOf = async (id = callId) => (await prisma.call.findUnique({ where: { id } }))!.version;
  const host = async (user: string, action: string, body: { targetUserId?: string; expectedVersion?: number; reason?: string } = {}) =>
    api("post", `/calls/${callId}/host/${action}`, user, { expectedVersion: await versionOf(), ...body });
  const part = (userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
  const lastPermission = (identity: string) => {
    const calls = h.media.callsOf("updateParticipant").filter((c) => c.args[1] === identity && (c.args[2] as { permission?: unknown }).permission);
    return (calls[calls.length - 1]!.args[2] as { permission: { canPublish: boolean; canPublishSources: string[] } }).permission;
  };
  const hostActions = (type: string) => h.emitted.filter((e) => e.event === "call:host-action" && (e.payload as { type?: string }).type === type);

  describe("chặn / bỏ chặn phát biểu (VR-08)", () => {
    it("block-audio: DB + LiveKit (bỏ MICROPHONE, giữ CAMERA) + tắt track mic đang phát; tín hiệu tới người bị chặn và cả phòng; token cấp sau đó không có mic", async () => {
      callId = await startRoom();
      const res = await host(w.u.A!, "block-audio", { targetUserId: w.u.B });
      expect(res.status).toBe(200);
      expect(res.body.data.participant).toMatchObject({ userId: w.u.B, mutedByHost: true });

      const b = await part(w.u.B!);
      expect([b!.mutedByHost, b!.publishPermissions.audio]).toEqual([true, false]);
      expect(lastPermission(w.u.B!)).toMatchObject({ canPublish: true, canPublishSources: ["CAMERA"] });
      expect(h.media.callsOf("mutePublishedTrack").map((c) => c.args)).toEqual([[roomOf(callId), w.u.B, "TR_mic", true]]); // chỉ mic, không đụng camera

      await drainOutbox(h);
      const blocked = hostActions("AUDIO_BLOCKED");
      expect(blocked.map((e) => e.target)).toEqual(expect.arrayContaining(["room", "users"]));
      expect(blocked.find((e) => e.target === "users")!.to).toEqual([w.u.B]);
      expect(blocked[0]!.payload).toMatchObject({ callId, targetUserId: w.u.B, byUserId: w.u.A });

      // Người dùng sửa client để lấy token mới → server vẫn không cấp quyền mic (cả token gia hạn lẫn vào lại bằng máy khác).
      const renewed = await api("post", `/calls/${callId}/token`, w.u.B!);
      expect(grantOf(renewed.body.data.token as string).canPublishSources).toEqual(["camera"]);
      const forced = await api("post", `/calls/${callId}/join`, w.u.B!, { deviceId: deviceId(), force: true });
      expect(grantOf(forced.body.data.token as string).canPublishSources).toEqual(["camera"]);
    });

    it("unblock-audio chỉ TRẢ LẠI quyền — không tự bật mic của người dùng (không unmute track)", async () => {
      callId = await startRoom();
      await host(w.u.A!, "block-audio", { targetUserId: w.u.B });
      h.media.calls.length = 0;
      const res = await host(w.u.A!, "unblock-audio", { targetUserId: w.u.B });
      expect(res.status).toBe(200);
      expect(lastPermission(w.u.B!).canPublishSources).toEqual(expect.arrayContaining(["MICROPHONE", "CAMERA"]));
      expect(h.media.callsOf("mutePublishedTrack")).toHaveLength(0);
      expect((await part(w.u.B!))!.mutedByHost).toBe(false);
      await drainOutbox(h);
      expect(hostActions("AUDIO_UNBLOCKED").length).toBeGreaterThan(0);
    });

    it("kênh không cho video + chặn mic → danh sách nguồn RỖNG thì canPublish=false (rỗng + canPublish=true sẽ cho phát MỌI nguồn)", async () => {
      const audioOnly = await seedChannel(w, { voiceSettings: { allowVideo: false, maxParticipants: 8 } });
      callId = await startRoom(["B"], audioOnly);
      await host(w.u.A!, "block-audio", { targetUserId: w.u.B });
      expect(lastPermission(w.u.B!)).toMatchObject({ canPublish: false, canPublishSources: [] });
      const renewed = await api("post", `/calls/${callId}/token`, w.u.B!);
      expect(grantOf(renewed.body.data.token as string).canPublish).toBe(false);
    });

    it("mute-request chỉ nhắc người đó (không đổi quyền, không gọi LiveKit); invite-speak hạ tay và bỏ chặn", async () => {
      callId = await startRoom();
      h.media.calls.length = 0;
      const res = await host(w.u.A!, "mute-request", { targetUserId: w.u.C });
      expect(res.status).toBe(200);
      expect(h.media.callsOf("updateParticipant")).toHaveLength(0);
      expect(h.media.callsOf("mutePublishedTrack")).toHaveLength(0);
      expect((await part(w.u.C!))!.mutedByHost).toBe(false);
      await drainOutbox(h);
      expect(hostActions("MUTE_REQUEST")[0]!.payload).toMatchObject({ targetUserId: w.u.C });

      // B giơ tay, bị chặn mic; chủ phòng "mời phát biểu" → tay hạ + mic được trả + thuộc tính handRaised xoá.
      await api("post", `/calls/${callId}/hand`, w.u.B!, { raised: true });
      await host(w.u.A!, "block-audio", { targetUserId: w.u.B });
      const invited = await host(w.u.A!, "invite-speak", { targetUserId: w.u.B });
      expect(invited.status).toBe(200);
      const b = await part(w.u.B!);
      expect([b!.handRaisedAt, b!.mutedByHost, b!.publishPermissions.audio]).toEqual([null, false, true]);
      const attrCalls = h.media.callsOf("updateParticipant").filter((c) => c.args[1] === w.u.B && (c.args[2] as { attributes?: unknown }).attributes);
      expect(attrCalls[attrCalls.length - 1]!.args[2]).toMatchObject({ attributes: { handRaised: "" } });
    });
  });

  describe("kiểm tra chung của host action (VR-11)", () => {
    beforeEach(async () => {
      callId = await startRoom();
    });

    it("người thường → 403 CALL_015; version cũ → 409 CALL_011 (kèm version hiện tại); người không ở trong phòng → 403 CALL_014; thiếu đích → 400", async () => {
      const notHost = await host(w.u.B!, "block-audio", { targetUserId: w.u.C });
      expect([notHost.status, notHost.body.error.code]).toEqual([403, "CALL_015"]);

      const stale = await host(w.u.A!, "block-audio", { targetUserId: w.u.B, expectedVersion: 999 });
      expect([stale.status, stale.body.error.code]).toEqual([409, "CALL_011"]);
      expect(stale.body.error.details.currentVersion).toBe(await versionOf());

      const outsider = await host(w.u.A!, "block-audio", { targetUserId: w.u.F });
      expect([outsider.status, outsider.body.error.code]).toEqual([403, "CALL_014"]);

      const noTarget = await host(w.u.A!, "block-audio");
      expect(noTarget.status).toBe(400);
      const self = await host(w.u.A!, "block-audio", { targetUserId: w.u.A });
      expect(self.status).toBe(400);
      expect((await part(w.u.B!))!.mutedByHost).toBe(false); // không thao tác nào lọt qua
    });

    it("hai thao tác cùng expectedVersion → một thắng, một 409 CALL_011 (CAS theo Call.version)", async () => {
      const v = await versionOf();
      const [x, y] = await Promise.all([
        api("post", `/calls/${callId}/host/block-audio`, w.u.A!, { targetUserId: w.u.B, expectedVersion: v }),
        api("post", `/calls/${callId}/host/mute-request`, w.u.A!, { targetUserId: w.u.C, expectedVersion: v }),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      expect(await versionOf()).toBe(v + 1);
    });
  });

  describe("mời ra khỏi phòng (VR-06)", () => {
    it("remove: REMOVED + đá LiveKit + thu quyền scope CALL; không vào lại PHIÊN này (CALL_016) nhưng vào lại được phiên mới", async () => {
      callId = await startRoom();
      const res = await host(w.u.A!, "remove", { targetUserId: w.u.B, reason: "Làm ồn" });
      expect(res.status).toBe(200);
      expect(await part(w.u.B!)).toMatchObject({ state: "REMOVED", removedBy: w.u.A });
      expect(h.media.callsOf("removeParticipant").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.B]);
      expect(spy.leftRooms.some((l) => l.userIds.includes(w.u.B!) && l.rooms.includes(`call:${callId}`))).toBe(true);
      expect((await h.container.deps.store.peekBusy([w.u.B!])).size).toBe(0);

      await drainOutbox(h);
      const toB = hostActions("REMOVED").find((e) => e.target === "users");
      expect(toB!.to).toEqual([w.u.B]);
      expect(toB!.payload).toMatchObject({ reason: "Làm ồn", targetUserId: w.u.B });

      const rejoin = await api("post", `/calls/${callId}/join`, w.u.B!, { deviceId: deviceId() });
      expect([rejoin.status, rejoin.body.error.code]).toEqual([403, "CALL_016"]);
      const create = await enter(w.u.B!);
      expect([create.status, create.body.error.code]).toEqual([403, "CALL_016"]);
      expect((await api("post", `/calls/${callId}/token`, w.u.B!)).status).toBe(403);

      // C vẫn ở trong phòng; sau khi phòng kết thúc, B mở/vào phiên MỚI bình thường.
      expect((await part(w.u.C!))!.state).toBe("CONNECTED");
      await host(w.u.A!, "end");
      const fresh = await enter(w.u.B!);
      expect([fresh.status, fresh.body.data.call.id === callId]).toEqual([201, false]);
    });
  });

  describe("chuyển chủ phòng và kết thúc phòng", () => {
    it("transfer: hostId + vai trò hai bên đổi, metadata LiveKit đồng bộ, chủ cũ mất quyền điều khiển; đích chưa kết nối → CALL_019", async () => {
      callId = await startRoom();
      const joining = await enter(w.u.D!); // vào nhưng chưa kết nối LiveKit
      expect(joining.status).toBe(200);

      const bad = await host(w.u.A!, "transfer", { targetUserId: w.u.D });
      expect([bad.status, bad.body.error.code]).toEqual([400, "CALL_019"]);
      expect((await prisma.call.findUnique({ where: { id: callId } }))!.hostId).toBe(w.u.A);

      const res = await host(w.u.A!, "transfer", { targetUserId: w.u.B });
      expect(res.status).toBe(200);
      expect((await prisma.call.findUnique({ where: { id: callId } }))!.hostId).toBe(w.u.B);
      expect([(await part(w.u.A!))!.role, (await part(w.u.B!))!.role]).toEqual(["MEMBER", "HOST"]);
      const meta = h.media.callsOf("updateParticipant").filter((c) => (c.args[2] as { metadata?: string }).metadata);
      expect(meta.map((c) => JSON.parse((c.args[2] as { metadata: string }).metadata).role).sort()).toEqual(["HOST", "MEMBER"]);
      await drainOutbox(h);
      expect(hostActions("HOST_CHANGED")[0]!.payload).toMatchObject({ targetUserId: w.u.B, byUserId: w.u.A });
      // Chủ cũ cũng được báo riêng (bản công khai ở `ch:{id}`) để preview kênh bỏ nhãn "Chủ phòng" của họ.
      const oldHostPublic = h.emitted.filter((e) => e.event === "call:participant-updated" && e.to === `ch:${ch}` && (e.payload.participant as { userId: string }).userId === w.u.A).pop();
      expect((oldHostPublic!.payload.participant as { isHost: boolean }).isHost).toBe(false);

      expect((await host(w.u.A!, "block-audio", { targetUserId: w.u.C })).body.error.code).toBe("CALL_015");
      expect((await host(w.u.B!, "block-audio", { targetUserId: w.u.C })).status).toBe(200);
    });

    it("end: chỉ chủ phòng; kết thúc HOST_ENDED, xoá phòng LiveKit, mọi người rời; thao tác sau đó 410 CALL_005", async () => {
      callId = await startRoom();
      const notHost = await api("post", `/calls/${callId}/host/end`, w.u.B!, { expectedVersion: 1 });
      expect([notHost.status, notHost.body.error.code]).toEqual([403, "CALL_015"]);
      const viaEnd = await api("post", `/calls/${callId}/end`, w.u.B!, { forEveryone: true });
      expect([viaEnd.status, viaEnd.body.error.code]).toEqual([403, "CALL_015"]);

      // `end` không bắt khớp version: version cũ vẫn kết thúc được.
      const res = await api("post", `/calls/${callId}/host/end`, w.u.A!, { expectedVersion: 1 });
      expect(res.status).toBe(200);
      const call = await prisma.call.findUnique({ where: { id: callId } });
      expect([call!.status, call!.endReason, call!.endedBy, call!.activeKey]).toEqual(["ENDED", "HOST_ENDED", w.u.A, `ended:${callId}`]);
      expect(h.media.callsOf("deleteRoom").map((c) => c.args[0])).toContain(roomOf(callId));
      expect((await prisma.callParticipant.findMany({ where: { callId } })).every((p) => p.state === "LEFT")).toBe(true);
      expect(await h.container.deps.store.peekActive("CHANNEL", ch)).toBeNull();

      const after = await host(w.u.A!, "block-audio", { targetUserId: w.u.B });
      expect([after.status, after.body.error.code]).toEqual([410, "CALL_005"]);
    });
  });

  describe("chia sẻ màn hình — một người/phòng (VR-09)", () => {
    beforeEach(async () => {
      callId = await startRoom();
    });
    const share = (userId: string, on: boolean) => api("post", `/calls/${callId}/screen-share`, userId, { on });

    it("hai người xin cùng lúc → một được, một 409 CALL_017 (kèm người đang giữ); quyền nguồn màn hình chỉ cấp cho người thắng", async () => {
      const [b, c] = await Promise.all([share(w.u.B!, true), share(w.u.C!, true)]);
      const winner = b.status === 200 ? b : c;
      const loser = b.status === 200 ? c : b;
      const [winnerId, loserId] = b.status === 200 ? [w.u.B!, w.u.C!] : [w.u.C!, w.u.B!];
      expect([winner.status, loser.status]).toEqual([200, 409]);
      expect(winner.body.data).toMatchObject({ granted: true, holderUserId: winnerId });
      expect([loser.body.error.code, loser.body.error.details.holderUserId]).toEqual(["CALL_017", winnerId]);

      expect((await part(winnerId))!.publishPermissions.screen).toBe(true);
      expect((await part(loserId))!.publishPermissions.screen).toBe(false);
      expect(lastPermission(winnerId).canPublishSources).toEqual(expect.arrayContaining(["SCREEN_SHARE", "SCREEN_SHARE_AUDIO"]));
      expect(await h.container.deps.store.peekScreen(callId)).toBe(winnerId);

      // Người giữ slot gọi lại → idempotent; người khác nhả → không ảnh hưởng.
      expect((await share(winnerId, true)).status).toBe(200);
      const noop = await share(loserId, false);
      expect([noop.status, noop.body.data.granted]).toEqual([200, false]);
      expect(await h.container.deps.store.peekScreen(callId)).toBe(winnerId);

      // Nhả → người kia được nhận.
      expect((await share(winnerId, false)).body.data).toMatchObject({ granted: false, holderUserId: null });
      expect((await part(winnerId))!.publishPermissions.screen).toBe(false);
      expect(lastPermission(winnerId).canPublishSources).not.toContain("SCREEN_SHARE");
      expect((await share(loserId, true)).status).toBe(200);
    });

    it("nhả slot khi: chủ phòng dừng chia sẻ (end-share + tắt track), track_unpublished, người giữ slot rời phòng", async () => {
      await share(w.u.C!, true);
      h.media.join(roomOf(callId), { identity: w.u.C!, tracks: [MIC, SCREEN].map((t) => ({ ...t })) });
      const stopped = await host(w.u.A!, "end-share", { targetUserId: w.u.C });
      expect(stopped.status).toBe(200);
      expect(await h.container.deps.store.peekScreen(callId)).toBeNull();
      expect((await part(w.u.C!))!.publishPermissions.screen).toBe(false);
      expect(lastPermission(w.u.C!).canPublishSources).not.toContain("SCREEN_SHARE");
      expect(h.media.callsOf("mutePublishedTrack").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.C, "TR_scr", true]);
      await drainOutbox(h);
      expect(hostActions("SCREEN_SHARE_ENDED").length).toBeGreaterThan(0);

      // Client tự dừng: webhook track_unpublished (nguồn SCREEN_SHARE) nhả slot.
      await share(w.u.B!, true);
      expect(await h.container.deps.store.peekScreen(callId)).toBe(w.u.B);
      expect(await dispatchLiveKitEvent(lkEvent("track_unpublished", roomOf(callId), { identity: w.u.B!, track: SCREEN }))).toBe("PROCESSED");
      expect(await h.container.deps.store.peekScreen(callId)).toBeNull();
      expect((await part(w.u.B!))!.publishPermissions.screen).toBe(false);

      // Người giữ slot mất kết nối → nhả.
      await share(w.u.B!, true);
      await disconnect(h, callId, w.u.B!);
      expect(await h.container.deps.store.peekScreen(callId)).toBeNull();
    });

    it("người chưa kết nối (JOINING) không xin được slot: 403 CALL_014; người ngoài phòng 403", async () => {
      await enter(w.u.D!);
      expect((await share(w.u.D!, true)).body.error.code).toBe("CALL_014");
      expect((await share(w.u.F!, true)).body.error.code).toBe("CALL_014");
    });
  });

  describe("giơ tay — thứ tự do server (VR-10)", () => {
    it("3 người giơ tay lần lượt → handRaisedAt tăng theo giờ SERVER; lặp cùng giá trị idempotent; hạ rồi giơ lại xuống cuối; LiveKit nhận attribute", async () => {
      callId = await startRoom(["B", "C", "D"]);
      const raise = (u: string, raised = true) => api("post", `/calls/${callId}/hand`, u, { raised });
      // Thân yêu cầu KHÔNG có mốc thời gian: đồng hồ máy khách lệch thế nào cũng không ảnh hưởng thứ tự.
      expect((await raise(w.u.C!)).status).toBe(200);
      await sleep(15);
      expect((await raise(w.u.B!)).status).toBe(200);
      await sleep(15);
      expect((await raise(w.u.D!)).status).toBe(200);

      const order = async () => {
        const detail = await api("get", `/calls/${callId}`, w.u.A!);
        return (detail.body.data.participants as Array<{ userId: string; handRaisedAt: string | null }>)
          .filter((p) => p.handRaisedAt)
          .sort((a, b) => Date.parse(a.handRaisedAt!) - Date.parse(b.handRaisedAt!))
          .map((p) => p.userId);
      };
      expect(await order()).toEqual([w.u.C, w.u.B, w.u.D]);

      const before = (await part(w.u.C!))!.handRaisedAt!.getTime();
      const again = await raise(w.u.C!);
      expect(again.body.data.participant.handRaisedAt).toBe(new Date(before).toISOString());
      expect((await part(w.u.C!))!.handRaisedAt!.getTime()).toBe(before);

      await raise(w.u.C!, false);
      await sleep(15);
      await raise(w.u.C!, true);
      expect(await order()).toEqual([w.u.B, w.u.D, w.u.C]);

      const attrs = h.media.callsOf("updateParticipant").filter((c) => c.args[1] === w.u.C && (c.args[2] as { attributes?: { handRaised: string } }).attributes);
      const values = attrs.map((c) => (c.args[2] as { attributes: { handRaised: string } }).attributes.handRaised);
      expect(values[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // đang giơ: ISO của server
      expect(values).toContain(""); // đã hạ
      await drainOutbox(h);
      const updates = h.emitted.filter((e) => e.event === "call:participant-updated" && e.target === "room" && e.to === `call:${callId}`);
      expect(updates.some((e) => (e.payload.participant as { userId: string; handRaisedAt: string | null }).handRaisedAt !== null)).toBe(true);
    });

    it("người chưa kết nối hoặc ngoài phòng không giơ tay được (403 CALL_014)", async () => {
      callId = await startRoom(["B"]);
      await enter(w.u.D!);
      expect((await api("post", `/calls/${callId}/hand`, w.u.D!, { raised: true })).body.error.code).toBe("CALL_014");
      expect((await api("post", `/calls/${callId}/hand`, w.u.F!, { raised: true })).body.error.code).toBe("CALL_014");
    });
  });
});
