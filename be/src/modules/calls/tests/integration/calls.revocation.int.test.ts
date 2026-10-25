import { installMocks, redisStore } from "./calls-test-mocks";
import { buildCallsApp, cleanupWorld, clientCallId, deviceId, drainOutbox, ensureCallIndexes, installHarness, makeApi, seedWorld, type CallsHarness, type World } from "./calls-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { registerRevokeListener, clearRevokeListeners, revokeScope } from "../../../../core/permission";
import { setPermissionPorts, resetPermissionPorts } from "../../../../core/permission";
import type { CallRevocationInput } from "../../services/call-revocation.service";

const app = buildCallsApp();
const api = makeApi(app);

describe("calls — thu hồi quyền và vòng đời phạm vi (integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let h: CallsHarness;
  let w: World;
  const leftRooms: Array<{ userIds: string[]; rooms: string[] }> = [];

  beforeAll(async () => {
    await ensureCallIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    w = await seedWorld();
    worlds.push(w);
    leftRooms.length = 0;
    setPermissionPorts({
      realtime: {
        leaveRooms: (userIds, rooms) => {
          leftRooms.push({ userIds, rooms });
          return Promise.resolve();
        },
        emitToUsers: () => Promise.resolve(),
      },
      outbox: { enqueueNow: () => Promise.resolve() },
    });
    // Mô phỏng job `call.revocation`: listener gọi thẳng service (trong sản xuất là job queue `calls`).
    clearRevokeListeners();
    registerRevokeListener("calls.revocation", async (input) => {
      if (!["CONVERSATION", "CHANNEL", "WORKSPACE", "MEETING"].includes(input.scope.type)) return; // như `registerCallRevokeListener`
      await h.container.revocation.handle({
        scopeType: input.scope.type as CallRevocationInput["scopeType"],
        scopeId: input.scope.id,
        userIds: input.userIds,
        reason: input.reason,
      });
    });
  });

  afterEach(async () => {
    clearRevokeListeners();
    resetPermissionPorts();
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const startGroupCall = async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    for (const uid of [w.u.B!, w.u.C!]) await api("post", `/calls/${callId}/answer`, uid, { deviceId: deviceId() });
    return callId;
  };

  it("CL-11: bị xoá khỏi nhóm khi đang trong cuộc gọi → participant REMOVED, removeParticipant LiveKit, token bị 403, không join lại; cuộc gọi của người khác tiếp tục", async () => {
    const callId = await startGroupCall();
    await revokeScope({ scope: { type: "CONVERSATION", id: w.group }, userIds: [w.u.C!], reason: "REMOVED" });
    const p = await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.C! } } });
    expect(p!.state).toBe("REMOVED");
    expect(h.media.callsOf("removeParticipant").some((c) => c.args[0] === `call_${callId}` && c.args[1] === w.u.C)).toBe(true);
    // scope CALL bị bump + đá khỏi room call:{id}
    expect(leftRooms.some((l) => l.userIds.includes(w.u.C!) && l.rooms.includes(`call:${callId}`))).toBe(true);
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ACTIVE");

    // Người bị xoá không còn là thành viên hội thoại trên thực tế: mô phỏng để token/join bị từ chối theo quyền.
    await prisma.conversationMember.updateMany({ where: { conversationId: w.group, userId: w.u.C! }, data: { status: "REMOVED" } });
    const { permissionService } = await import("../../../../core/permission");
    await permissionService.bumpVersion({ type: "CONVERSATION", id: w.group });
    const token = await api("post", `/calls/${callId}/token`, w.u.C!);
    expect(token.status).toBe(403);
    const rejoin = await api("post", `/calls/${callId}/join`, w.u.C!, { deviceId: deviceId() });
    expect([rejoin.status, rejoin.body.error.code]).toEqual([404, "CALL_001"]);
    await drainOutbox(h);
    expect(h.eventsTo(w.u.C!, "call:participant-updated")).toHaveLength(1);
  });

  it("REMOVED được thêm lại vào hội thoại vẫn không vào lại cuộc gọi đó: join → 403 CALL_016", async () => {
    const callId = await startGroupCall();
    await revokeScope({ scope: { type: "CONVERSATION", id: w.group }, userIds: [w.u.C!], reason: "REMOVED" });
    const rejoin = await api("post", `/calls/${callId}/join`, w.u.C!, { deviceId: deviceId() });
    expect([rejoin.status, rejoin.body.error.code]).toEqual([403, "CALL_016"]);
  });

  it("1-1: người kia bị thu hồi quyền khỏi hội thoại → endCall(REVOKED); đổi vai trò (ROLE_CHANGED) không ảnh hưởng cuộc gọi", async () => {
    const created = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.direct, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    const callId = created.body.data.call.id as string;
    await api("post", `/calls/${callId}/answer`, w.u.B!, { deviceId: deviceId() });
    await revokeScope({ scope: { type: "CONVERSATION", id: w.direct }, userIds: [w.u.B!], reason: "ROLE_CHANGED" });
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.status).toBe("ACTIVE");
    await revokeScope({ scope: { type: "CONVERSATION", id: w.direct }, userIds: [w.u.B!], reason: "REMOVED" });
    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect([call!.status, call!.endReason]).toEqual(["ENDED", "REVOKED"]);
    expect(await h.container.deps.store.peekActive("CONVERSATION", w.direct)).toBeNull();
  });

  it("nhóm chat giải tán (DISSOLVED) và workspace lưu trữ (ARCHIVED) → mọi cuộc gọi chưa kết thúc của phạm vi → endCall(ARCHIVED), đúng 1 tóm tắt", async () => {
    const callId = await startGroupCall();
    await revokeScope({ scope: { type: "CONVERSATION", id: w.group }, userIds: [], reason: "DISSOLVED" });
    expect((await prisma.call.findUnique({ where: { id: callId } }))!.endReason).toBe("ARCHIVED");
    await drainOutbox(h);
    expect(await prisma.message.count({ where: { scopeType: "CONVERSATION", scopeId: w.group, systemType: "CALL_SUMMARY" } })).toBe(1);

    const second = await api("post", "/calls", w.u.A!, { scopeType: "CONVERSATION", scopeId: w.group, mediaKind: "AUDIO", clientCallId: clientCallId(), deviceId: deviceId() });
    await revokeScope({ scope: { type: "WORKSPACE", id: w.workspaceId }, userIds: [], reason: "ARCHIVED", cascade: false });
    expect((await prisma.call.findUnique({ where: { id: second.body.data.call.id } }))!.endReason).toBe("ARCHIVED");
  });

  it("lỗi của listener không làm hỏng revokeScope (chỉ log)", async () => {
    clearRevokeListeners();
    registerRevokeListener("boom", () => {
      throw new Error("listener lỗi");
    });
    await expect(revokeScope({ scope: { type: "CONVERSATION", id: w.group }, userIds: [], reason: "REMOVED" })).resolves.toBeUndefined();
  });
});
