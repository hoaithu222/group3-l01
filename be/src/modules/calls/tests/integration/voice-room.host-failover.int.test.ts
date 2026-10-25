import { installMocks, redisStore } from "./calls-test-mocks";
import { clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, type CallsHarness } from "./calls-test-kit";
import {
  buildVoiceApp,
  cleanupVoiceWorld,
  connect,
  disconnect,
  installPermissionPorts,
  MIC,
  resetPermissionSpy,
  roomOf,
  seedChannel,
  seedVoiceWorld,
  type VoiceWorld,
} from "./voice-test-kit";
import { permissionService } from "../../../../core/permission";
import { prisma } from "../../../../infrastructure/database";

const app = buildVoiceApp();
const api = makeApi(app);

/** VR-04/VR-11 (be.md §10): chủ phòng mất kết nối → chuyển đúng MỘT chủ mới; chủ rời chủ động; hộp thoại rời của chủ phòng. */
describe("p2-03 — chuyển chủ phòng (integration, Mongo memory replset)", () => {
  const worlds: VoiceWorld[] = [];
  let h: CallsHarness;
  let w: VoiceWorld;
  let ch: string;
  let callId: string;

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    installPermissionPorts();
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

  /** A tạo phòng rồi lần lượt B, C, D vào và kết nối — thứ tự `firstJoinedAt`: A < B < C < D. */
  async function startRoom(channelId = ch, joiners = ["B", "C"]): Promise<string> {
    const first = await enter(w.u.A!, channelId);
    const id = first.body.data.call.id as string;
    await connect(h, id, w.u.A!, [MIC]);
    for (const name of joiners) {
      await enter(w.u[name]!, channelId);
      await connect(h, id, w.u[name]!, [MIC]);
      await new Promise((r) => setTimeout(r, 5)); // firstJoinedAt khác nhau rõ ràng
    }
    return id;
  }
  const hostOf = async () => (await prisma.call.findUnique({ where: { id: callId } }))!.hostId;
  const part = (userId: string) => prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
  const leave = (userId: string, body: Record<string, unknown> = {}) => api("post", `/calls/${callId}/leave`, userId, body);

  describe("chủ phòng mất kết nối (webhook)", () => {
    beforeEach(async () => {
      callId = await startRoom();
    });

    it("participant_left của chủ phòng → LEFT + xếp failover sau 30 s; chủ quay lại kịp → job no-op, vẫn là chủ", async () => {
      await disconnect(h, callId, w.u.A!);
      expect((await part(w.u.A!))!.state).toBe("LEFT");
      expect(h.failoverScheduled).toEqual([{ callId, version: expect.any(Number), delayMs: 30_000 }]);
      expect(await hostOf()).toBe(w.u.A); // chưa chuyển trong thời gian chờ

      await connect(h, callId, w.u.A!, [MIC]); // LiveKit tự nối lại
      expect(await h.container.host.failover(callId)).toBe("NOOP");
      expect(await hostOf()).toBe(w.u.A);
      expect((await part(w.u.A!))!.role).toBe("HOST");
    });

    it("quá 30 s: hai job failover chạy song song → đúng MỘT lần đổi, chủ mới là người vào lâu nhất; chủ cũ quay lại KHÔNG chiếm lại", async () => {
      await disconnect(h, callId, w.u.A!);
      const results = await Promise.all([h.container.host.failover(callId), h.container.host.failover(callId)]);
      expect(results.sort()).toEqual(["CHANGED", "NOOP"]);
      expect(await hostOf()).toBe(w.u.B); // B vào trước C
      expect([(await part(w.u.A!))!.role, (await part(w.u.B!))!.role, (await part(w.u.C!))!.role]).toEqual(["MEMBER", "HOST", "MEMBER"]);

      await drainOutbox(h);
      const changed = h.emitted.filter((e) => e.event === "call:host-action" && (e.payload as { type?: string }).type === "HOST_CHANGED");
      expect(changed.length).toBeGreaterThan(0);
      expect(changed[0]!.payload).toMatchObject({ targetUserId: w.u.B, reason: "FAILOVER" });
      expect(new Set(h.emitted.filter((e) => e.event === "call:host-action").map((e) => e.payload.version)).size).toBe(1); // một lần đổi = một version
      // Người xem preview ở `ch:{id}` nhận bản công khai của CẢ HAI người: chủ mới isHost=true, chủ cũ isHost=false (không còn nhãn "Chủ phòng").
      const publicHost = (userId: string) =>
        h.emitted.filter((e) => e.event === "call:participant-updated" && e.to === `ch:${ch}` && (e.payload.participant as { userId: string }).userId === userId).pop();
      expect((publicHost(w.u.B!)!.payload.participant as { isHost: boolean }).isHost).toBe(true);
      expect((publicHost(w.u.A!)!.payload.participant as { isHost: boolean }).isHost).toBe(false);

      await connect(h, callId, w.u.A!, [MIC]);
      expect(await h.container.host.failover(callId)).toBe("NOOP"); // chủ hiện tại (B) đang trong phòng
      expect(await hostOf()).toBe(w.u.B);
      const denied = await api("post", `/calls/${callId}/host/block-audio`, w.u.A!, { targetUserId: w.u.C, expectedVersion: (await prisma.call.findUnique({ where: { id: callId } }))!.version });
      expect([denied.status, denied.body.error.code]).toEqual([403, "CALL_015"]);
    });

    it("chủ mất kết nối và không còn ai khác trong phòng → NO_CANDIDATE (phòng tự đóng theo emptyTimeout), chủ không đổi", async () => {
      await disconnect(h, callId, w.u.C!);
      await disconnect(h, callId, w.u.B!);
      await disconnect(h, callId, w.u.A!);
      expect(await h.container.host.failover(callId)).toBe("NO_CANDIDATE");
      expect(await hostOf()).toBe(w.u.A);
    });

    it("reconcile thấy chủ phòng không còn trong LiveKit (mất webhook) → LEFT + xếp failover sau 30 s; phòng đã kết thúc → failover no-op", async () => {
      h.media.leave(roomOf(callId), w.u.A!); // không có webhook nào tới
      await h.container.reconcile.reconcile(callId);
      expect((await part(w.u.A!))!.state).toBe("LEFT");
      expect(h.failoverScheduled.some((f) => f.callId === callId && f.delayMs === 30_000)).toBe(true);

      await h.container.ends.endCall(callId, "HOST_ENDED", w.u.B!);
      expect(await h.container.host.failover(callId)).toBe("NOOP");
    });

    it("người thường (không phải chủ phòng) rời/mất kết nối → KHÔNG kích hoạt failover", async () => {
      await disconnect(h, callId, w.u.C!);
      expect((await leave(w.u.B!)).status).toBe(200);
      expect(h.failoverScheduled).toHaveLength(0);
      expect(await hostOf()).toBe(w.u.A);
    });
  });

  describe("ứng viên phải còn quyền đọc kênh", () => {
    it("người vào lâu nhất đã mất grant kênh riêng tư → bị bỏ qua, chọn người kế tiếp", async () => {
      const priv = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.A!, w.u.B!, w.u.C!] });
      callId = await startRoom(priv);
      await prisma.channelGrant.deleteMany({ where: { channelId: priv, userId: w.u.B } });
      await permissionService.bumpVersion({ type: "CHANNEL", id: priv });

      await disconnect(h, callId, w.u.A!);
      expect(await h.container.host.failover(callId)).toBe("CHANGED");
      expect(await hostOf()).toBe(w.u.C);
    });
  });

  describe("chủ phòng bấm Rời (VR-11)", () => {
    beforeEach(async () => {
      callId = await startRoom();
    });

    it("không chọn gì → rời và failover NGAY (delay 0, không chờ 30 s) rồi job chuyển cho người vào lâu nhất", async () => {
      const res = await leave(w.u.A!);
      expect(res.status).toBe(200);
      expect((await part(w.u.A!))!.state).toBe("LEFT");
      expect(h.media.callsOf("removeParticipant").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.A]);
      expect(h.failoverScheduled.map((f) => f.delayMs)).toEqual([0]);
      expect(await h.container.host.failover(callId)).toBe("CHANGED");
      expect(await hostOf()).toBe(w.u.B);
    });

    it("chọn người nhận (transferToUserId) → chuyển chủ NGAY rồi rời, không cần failover", async () => {
      const res = await leave(w.u.A!, { transferToUserId: w.u.C });
      expect(res.status).toBe(200);
      expect(await hostOf()).toBe(w.u.C);
      expect([(await part(w.u.A!))!.state, (await part(w.u.A!))!.role, (await part(w.u.C!))!.role]).toEqual(["LEFT", "MEMBER", "HOST"]);
      expect(h.failoverScheduled).toHaveLength(0);
      await drainOutbox(h);
      expect(h.emitted.some((e) => e.event === "call:host-action" && (e.payload as { type?: string }).type === "HOST_CHANGED")).toBe(true);
    });

    it("người nhận không hợp lệ (chính mình / chưa kết nối / không ở trong phòng) → 400 CALL_019 và chủ phòng vẫn ở lại phòng", async () => {
      await enter(w.u.D!); // JOINING, chưa kết nối
      for (const target of [w.u.A!, w.u.D!, w.u.F!]) {
        const res = await leave(w.u.A!, { transferToUserId: target });
        expect([res.status, res.body.error.code]).toEqual([400, "CALL_019"]);
      }
      expect((await part(w.u.A!))!.state).toBe("CONNECTED");
      expect(await hostOf()).toBe(w.u.A);
    });

    it("Kết thúc cho mọi người (endForEveryone) → phiên ENDED/HOST_ENDED, không failover", async () => {
      const res = await leave(w.u.A!, { endForEveryone: true });
      expect(res.status).toBe(200);
      const call = await prisma.call.findUnique({ where: { id: callId } });
      expect([call!.status, call!.endReason]).toEqual(["ENDED", "HOST_ENDED"]);
      expect(h.failoverScheduled).toHaveLength(0);
      // Người không phải chủ phòng KHÔNG thể kết thúc bằng endForEveryone: chỉ rời.
      const other = await enter(w.u.B!);
      const callId2 = other.body.data.call.id as string;
      await connect(h, callId2, w.u.B!, [MIC]);
      await enter(w.u.C!);
      await connect(h, callId2, w.u.C!, [MIC]);
      callId = callId2;
      await leave(w.u.C!, { endForEveryone: true });
      expect((await prisma.call.findUnique({ where: { id: callId2 } }))!.status).toBe("ACTIVE");
    });

    it("chủ phòng chỉ còn một mình bấm Rời → phòng không có ai để chuyển, chờ emptyTimeout (không lỗi)", async () => {
      await leave(w.u.C!);
      await leave(w.u.B!);
      const res = await leave(w.u.A!);
      expect(res.status).toBe(200);
      expect(await h.container.host.failover(callId)).toBe("NO_CANDIDATE");
    });
  });
});
