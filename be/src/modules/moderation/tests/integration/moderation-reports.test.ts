/**
 * Integration — báo cáo/kiểm duyệt (p1-08 README §8): MOD-01 (báo cáo trùng idempotent), MOD-02 (kênh private không grant → 404),
 * MOD-03 (OWNER thấy hàng đợi kênh public, không thấy kênh private không grant), MOD-04 (MANAGER kênh private gỡ tin: tombstone +
 * audit + đóng nhóm + tác giả nhận thông báo), MOD-05 (thiếu `moderation:approve` → 403), MOD-06 (xem nhóm chat ±3 + audit
 * `moderation.view-private` + OWNER nhận thông báo), MOD-07 (25 h sau khi đóng → 403 `MOD_005`), MOD-08 (không `reporterId`).
 * MOD-09 (tin đã lưu bị gỡ) thuộc p1-09 (`discovery`) — không ở đây.
 *
 * Mongo memory replset; processor outbox (`report.events`, `moderation.private-viewed.notify`) bắt qua `registerJob` giả rồi gọi
 * TAY với payload dòng outbox vừa ghi (relay/BullMQ thật không chạy trong Jest).
 *
 * ✅ 2026-09-25 chạy xanh (`TEST_DB=memory npx jest … --runInBand`; Redis được mock, không cần BullMQ thật). Lần chạy đầu lộ 3 lỗi của CHÍNH test
 * (chưa từng chạy khi viết): tạo kênh là quyền OWNER/ADMIN nên kênh kín do OWNER tạo rồi trao MANAGER + rời; chưa mount `channel-grants.routes`; không dựng
 * Socket.IO nên phải mock `socket.emit`. Mẫu: `conversations-admin.test.ts` + `messages-realtime.test.ts`.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setNx: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));

// Không dựng Socket.IO/cầu nối Redis trong test này: mọi hàm phát/đá room thật (consumer `report.events`, `revokeScope` khi rời kênh) sẽ ném "chưa khởi tạo".
jest.mock("../../../../infrastructure/socket/socket.emit", () => ({
  ...jest.requireActual("../../../../infrastructure/socket/socket.emit"),
  emitToRoom: jest.fn(),
  emitToUsers: jest.fn(),
  emitToScope: jest.fn(),
  emitToAll: jest.fn(),
  leaveRooms: jest.fn().mockResolvedValue(undefined),
  joinRooms: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import reportsRoutes from "../../reports.routes";
import scopeReportsRoutes from "../../scope-reports.routes";
import adminModerationRoutes from "../../admin-moderation.routes";
import { MODERATION_NOTIFICATION_TYPES } from "../../moderation.notification-types";
import "../../jobs/report-events.consumer"; // side-effect: đăng ký processor qua `registerJob` đã mock
import "../../jobs/moderation-notify.consumer";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", reportsRoutes);
  app.use("/api/v1", scopeReportsRoutes);
  app.use("/api/v1", adminModerationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();
const HOUR = 3600 * 1000;

function processor(jobName: string): Processor {
  const call = mockRegistered.find((c) => c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor ${jobName}`);
  return call[2];
}

describe("moderation — MOD-01…08", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    await prisma.$runCommandRaw({
      createIndexes: "Report",
      indexes: [{ key: { reporterId: 1, targetType: 1, targetId: 1 }, name: "Report_reporterId_targetType_targetId_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Channel",
      indexes: [{ key: { workspaceId: 1, normalizedName: 1 }, name: "Channel_workspaceId_normalizedName_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Conversation",
      indexes: [
        { key: { directKey: 1 }, name: "Conversation_directKey_key", unique: true },
        { key: { meetingKey: 1 }, name: "Conversation_meetingKey_key", unique: true },
      ],
    });
  });

  afterAll(() => resetPermissionPorts());

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
    const conversationIds = (await prisma.conversation.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
    const scopeIds = [...channelIds, ...conversationIds];
    await prisma.report.deleteMany({ where: { OR: [{ workspaceId: { in: workspaceIds } }, { reporterId: { in: userIds } }] } });
    await prisma.message.deleteMany({ where: { scopeId: { in: scopeIds } } });
    await prisma.auditLog.deleteMany({ where: { action: "moderation.view-private", workspaceId: { in: workspaceIds } } });
    await prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Report", "Message", "Channel", "Conversation", "Workspace"] } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    workspaceIds.length = 0;
    userIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  const auth = (userId: string, role = "user") => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });

  /** owner (OWNER ws) + reporter/author/manager (MEMBER ws) — kênh public mặc định + 1 kênh PRIVATE mà `manager` là MANAGER (owner đã rời). */
  async function scenario() {
    const owner = await seedUser({ name: "Chủ nhóm" });
    const manager = await seedUser({ name: "Quản lý kênh kín" });
    const reporter = await seedUser({ name: "Người báo cáo" });
    const author = await seedUser({ name: "Tác giả" });
    const outsider = await seedUser({ name: "Thành viên không grant" });
    userIds.push(owner.id, manager.id, reporter.id, author.id, outsider.id);

    const ws = await request(app).post("/api/v1/workspaces").set(auth(owner.id)).set("Idempotency-Key", `idem-${randomUUID()}`).send({ name: "Nhóm kiểm duyệt" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const u of [manager, reporter, author, outsider]) await addMembership(workspaceId, u.id, "MEMBER");

    const publicChannel = await request(app).post(`/api/v1/workspaces/${workspaceId}/channels`).set(auth(owner.id)).send({ name: "cong-khai", visibility: "PUBLIC" });
    // Tạo kênh (public/private) là quyền OWNER/ADMIN (p1-03 README §6: MEMBER không có) nên OWNER tạo kênh kín, trao MANAGER cho `manager` (vẫn chỉ là
    // MEMBER của nhóm) rồi TỰ RỜI kênh — OWNER không được còn grant kênh kín để MOD-03 kiểm "OWNER không thấy báo cáo kênh kín mình không có grant".
    const privateChannel = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set(auth(owner.id))
      .send({ name: "kin", visibility: "PRIVATE", initialMemberIds: [manager.id, reporter.id, author.id] });
    const privateChannelId = privateChannel.body.data.id as string;
    const promote = await request(app).patch(`/api/v1/channels/${privateChannelId}/grants/${manager.id}`).set(auth(owner.id)).send({ level: "MANAGER" });
    const ownerLeaves = await request(app).delete(`/api/v1/channels/${privateChannelId}/grants/${owner.id}`).set(auth(owner.id));
    expect([publicChannel.status, privateChannel.status, promote.status, ownerLeaves.status]).toEqual([201, 201, 200, 200]);
    return { owner, manager, reporter, author, outsider, workspaceId, publicChannelId: publicChannel.body.data.id as string, privateChannelId };
  }

  async function post(channelId: string, userId: string, content: string): Promise<string> {
    const res = await request(app).post(`/api/v1/channels/${channelId}/messages`).set(auth(userId)).send({ clientMessageId: randomUUID(), content });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  /** Người nhận các thông báo kiểm duyệt loại `type` (đã sắp xếp). */
  async function recipientsOfType(type: string): Promise<string[]> {
    const rows = await prisma.notificationRecipient.findMany({ where: { notification: { type } }, select: { recipientId: true } });
    return rows.map((r) => r.recipientId).sort();
  }

  const report = (userId: string, messageId: string, reason = "SPAM") =>
    request(app).post("/api/v1/reports").set(auth(userId)).send({ targetType: "MESSAGE", targetId: messageId, reason });

  it("MOD-01: báo cáo cùng tin 2 lần → đúng 1 Report; lần 1 → 201, lần 2 → 200 alreadyReported (id cũ)", async () => {
    const s = await scenario();
    const messageId = await post(s.publicChannelId, s.author.id, "spam spam");

    const first = await report(s.reporter.id, messageId);
    const second = await report(s.reporter.id, messageId);

    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.data).toMatchObject({ id: first.body.data.id, alreadyReported: true });
    expect(await prisma.report.count({ where: { reporterId: s.reporter.id, targetId: messageId } })).toBe(1);
  }, 30_000);

  it("MOD-02: báo cáo tin trong kênh PRIVATE mình không có grant → 404 MOD_002 (không phân biệt không tồn tại/không quyền)", async () => {
    const s = await scenario();
    const messageId = await post(s.privateChannelId, s.author.id, "chuyện nội bộ");
    const res = await report(s.outsider.id, messageId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MOD_002");
    expect(await prisma.report.count({ where: { targetId: messageId } })).toBe(0);
  }, 30_000);

  it("MOD-03 + MOD-08: OWNER thấy báo cáo kênh public, KHÔNG thấy báo cáo kênh private không grant; response không có reporterId", async () => {
    const s = await scenario();
    const publicMsg = await post(s.publicChannelId, s.author.id, "quảng cáo");
    const privateMsg = await post(s.privateChannelId, s.author.id, "lời lẽ xấu");
    expect((await report(s.reporter.id, publicMsg)).status).toBe(201);
    expect((await report(s.reporter.id, privateMsg)).status).toBe(201);

    const res = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/reports`).set(auth(s.owner.id));

    expect(res.status).toBe(200);
    expect(res.body.data.map((i: { targetId: string }) => i.targetId)).toEqual([publicMsg]);
    expect(JSON.stringify(res.body)).not.toContain("reporterId");
    expect(JSON.stringify(res.body)).not.toContain(s.reporter.id);

    // MANAGER kênh private thấy đúng báo cáo của kênh mình; thành viên thường → 403 PERM_001.
    const asManager = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/reports`).set(auth(s.manager.id));
    expect(asManager.body.data.map((i: { targetId: string }) => i.targetId)).toEqual([privateMsg]);
    expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/reports`).set(auth(s.outsider.id))).status).toBe(403);
  }, 30_000);

  it("MOD-04: MANAGER kênh private gỡ tin có lý do → tombstone MODERATION, audit, đóng nhóm, tác giả nhận thông báo", async () => {
    const s = await scenario();
    const messageId = await post(s.privateChannelId, s.author.id, "chửi bới");
    const created = await report(s.reporter.id, messageId, "HARASSMENT");

    const resolved = await request(app)
      .post(`/api/v1/reports/${created.body.data.id}/resolve`)
      .set(auth(s.manager.id))
      .send({ action: "REMOVE_MESSAGE", reason: "Vi phạm quy tắc ứng xử" });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({ status: "RESOLVED", resolution: "CONTENT_REMOVED", closedCount: 1 });
    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(message).toMatchObject({ deleteMode: "MODERATION", deletedBy: s.manager.id, content: null });
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "message.moderator-remove", targetId: messageId }));
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "report.resolve", actorId: s.manager.id }));
    expect(await prisma.report.count({ where: { targetId: messageId, status: "OPEN" } })).toBe(0);

    // gọi tay processor `report.events` với dòng outbox `report.resolved` vừa ghi.
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "report.resolved" } });
    await processor("report.events")({ data: row.payload });
    // Đếm THEO LOẠI: tạo kênh kín với `initialMemberIds` đã sinh thêm thông báo "được thêm vào kênh" cho từng người — không thuộc phạm vi kiểm duyệt.
    expect(await recipientsOfType(MODERATION_NOTIFICATION_TYPES.CONTENT_REMOVED)).toEqual([s.author.id]);
    expect(await recipientsOfType(MODERATION_NOTIFICATION_TYPES.REPORT_RESOLVED)).toEqual([s.reporter.id]);

    // báo cáo lần 2 → MOD_001; người không phải người kiểm duyệt → 403
    const again = await request(app).post(`/api/v1/reports/${created.body.data.id}/resolve`).set(auth(s.manager.id)).send({ action: "DISMISS", reason: "Không vi phạm gì cả" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("MOD_001");
  }, 30_000);

  it("MOD-05: người dùng KHÔNG có moderation:approve mở nội dung → 403 (chỉ metadata)", async () => {
    const s = await scenario();
    const messageId = await post(s.privateChannelId, s.author.id, "kín");
    const created = await report(s.reporter.id, messageId);
    const res = await request(app).get(`/api/v1/admin/reports/${created.body.data.id}/content`).set(auth(s.owner.id, "user"));
    expect(res.status).toBe(403);
    // metadata thì role admin xem được (moderation:view), nhưng KHÔNG có nội dung tin trong danh sách.
    const list = await request(app).get("/api/v1/admin/reports").set(auth(s.owner.id, "admin"));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("kín");
  }, 30_000);

  it("MOD-06 + MOD-07: admin xem tin nhóm chat ±3 (audit view-private + OWNER nhận thông báo); 25 h sau khi đóng → 403 MOD_005", async () => {
    const s = await scenario();
    const group = await request(app)
      .post("/api/v1/conversations")
      .set(auth(s.author.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId: s.workspaceId, title: "Nhóm kín", memberIds: [s.reporter.id] });
    expect(group.status).toBe(201);
    const conversationId = group.body.data.id as string;
    const ids: string[] = [];
    for (const text of ["một", "hai", "ba bị báo cáo", "bốn", "năm"]) {
      const res = await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set(auth(s.author.id)).send({ clientMessageId: randomUUID(), content: text });
      ids.push(res.body.data.id as string);
    }
    const created = await report(s.reporter.id, ids[2]);
    expect(created.status).toBe(201);

    const view = await request(app).get(`/api/v1/admin/reports/${created.body.data.id}/content`).set(auth(s.owner.id, "admin"));

    expect(view.status).toBe(200);
    // Ngữ cảnh ±3 tính cả tin HỆ THỐNG (vd "nhóm được tạo", `content: null`) nằm trước tin đầu — chỉ so phần tin của người dùng.
    const contents = (view.body.data.messages as Array<{ content: string | null }>).map((m) => m.content).filter((c) => c !== null);
    expect(contents).toEqual(["một", "hai", "ba bị báo cáo", "bốn", "năm"]);
    expect(view.body.data.messages.filter((m: { isTarget: boolean }) => m.isTarget)).toHaveLength(1);
    expect(view.body.data.accessExpiresAt).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "moderation.view-private", targetId: created.body.data.id } });
    expect(audit).toMatchObject({ actorId: s.owner.id, workspaceId: s.workspaceId });
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "moderation.private-viewed" } });
    await processor("moderation.private-viewed.notify")({ data: row.payload });
    expect(await prisma.notificationRecipient.count({ where: { recipientId: s.owner.id } })).toBe(1);

    // đóng báo cáo rồi lùi mốc đóng 25 h → hết hiệu lực
    const closed = await request(app).patch(`/api/v1/admin/reports/${created.body.data.id}`).set(auth(s.owner.id, "admin")).send({ action: "DISMISS", reason: "Không vi phạm gì cả" });
    expect(closed.status).toBe(200);
    await prisma.report.updateMany({ where: { id: created.body.data.id }, data: { resolvedAt: new Date(Date.now() - 25 * HOUR) } });
    const expired = await request(app).get(`/api/v1/admin/reports/${created.body.data.id}/content`).set(auth(s.owner.id, "admin"));
    expect(expired.status).toBe(403);
    expect(expired.body.error.code).toBe("MOD_005");
  }, 60_000);
});
