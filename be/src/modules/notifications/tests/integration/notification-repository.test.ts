/**
 * Integration — `PrismaNotificationRepository` + `PrismaFanoutRepository` + API cài đặt thông báo trên Mongo THẬT
 * (memory replset): kiểm ngữ nghĩa Prisma+Mongo mà unit test in-memory không phủ được — filter theo `filterBucket`,
 * `markReadByStream` (streamKey/streamSeq), `cancelUnreadByScope`, `purgeExpired` (quan hệ `recipients: none`),
 * nâng `kind`/khôi phục mục đã huỷ khi upsert, và GET/PUT `/me/notification-preferences` + workspace (ghi null tường minh).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(),
    getdel: jest.fn(), incr: jest.fn(), expire: jest.fn(), exists: jest.fn(), setNx: jest.fn(),
    hset: jest.fn(), hgetall: jest.fn(), hdel: jest.fn(), scanKeys: jest.fn(), getClient: jest.fn(),
  },
}));
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: jest.fn(), emitToRoom: jest.fn(), leaveRooms: jest.fn() }));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import notificationsRoutes from "../../notifications.routes";
import { PrismaNotificationRepository } from "../../repositories";
import { PrismaFanoutRepository } from "../../repositories/fanout.repository.prisma";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", notificationsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const store = makeRedisStore();
jest.setTimeout(60_000);
const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

describe("notifications — repository + preference API (integration, Mongo memory)", () => {
  const repo = new PrismaNotificationRepository();
  const fanoutRepo = new PrismaFanoutRepository();
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  const notificationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$runCommandRaw({
      createIndexes: "NotificationRecipient",
      indexes: [{ key: { recipientId: 1, dedupeKey: 1 }, name: "NotificationRecipient_recipientId_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Notification",
      indexes: [{ key: { dedupeKey: 1 }, name: "Notification_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "NotificationPreference",
      indexes: [{ key: { userId: 1, scope: 1, scopeKey: 1 }, name: "NotificationPreference_userId_scope_scopeKey_key", unique: true }],
    });
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });

  afterEach(async () => {
    await prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
    workspaceIds.length = 0;
    notificationIds.length = 0;
    store.clear();
  });

  async function seedRow(input: {
    recipientId: string; kind: string; bucket: string; scopeId: string; streamKey: string; streamSeq: number; createdAt?: Date; type?: string;
  }): Promise<{ notificationId: string; rowId: string }> {
    const dedupeKey = `msg:${newObjectId()}`;
    const n = await prisma.notification.create({
      data: { type: input.type ?? "mention", scopeType: "CHANNEL", scopeId: input.scopeId, sourceType: "MESSAGE", sourceId: dedupeKey, dedupeKey, refs: { messageId: newObjectId() } },
    });
    notificationIds.push(n.id);
    const r = await prisma.notificationRecipient.create({
      data: {
        notificationId: n.id, recipientId: input.recipientId, kind: input.kind, kindRank: 100, inInbox: true, dedupeKey, scopeType: "CHANNEL", scopeId: input.scopeId,
        streamKey: input.streamKey, streamSeq: input.streamSeq, filterBucket: input.bucket, readAt: null, seenAt: null, skipReason: null, deliveredPushAt: null, cancelledAt: null,
        ...(input.createdAt && { createdAt: input.createdAt }),
      },
    });
    return { notificationId: n.id, rowId: r.id };
  }

  it("listInbox lọc theo filterBucket của người nhận + cursor (createdAt,id); unreadCount theo readAt và bucket", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const ch = newObjectId();
    const t0 = Date.now();
    await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 1, createdAt: new Date(t0 - 3000) });
    await seedRow({ recipientId: u.id, kind: "THREAD_REPLY", bucket: "following", scopeId: ch, streamKey: "t1", streamSeq: 1, createdAt: new Date(t0 - 2000) });
    const newest = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 2, createdAt: new Date(t0 - 1000) });

    expect((await repo.listInbox(u.id, { filter: "mentions", unreadOnly: false, limit: 10 })).data).toHaveLength(2);
    expect((await repo.listInbox(u.id, { filter: "following", unreadOnly: false, limit: 10 })).data).toHaveLength(1);
    const all = await repo.listInbox(u.id, { filter: "all", unreadOnly: false, limit: 2 });
    expect(all.hasMore).toBe(true);
    expect(all.data[0]?.id).toBe(newest.rowId); // mới nhất trước

    expect(await repo.unreadCount(u.id)).toEqual({ total: 3, byFilter: { mentions: 2, following: 1, calls: 0, meetings: 0 } });
    await repo.markRead(u.id, newest.rowId);
    expect((await repo.unreadCount(u.id)).total).toBe(2);
  });

  it("markReadByStream: chỉ mục CHƯA đọc, đúng streamKey, streamSeq ≤ seq; trả id đã đổi; chạy lại → rỗng", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const ch = newObjectId();
    const a = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 3 });
    const b = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 9 });
    const thread = await seedRow({ recipientId: u.id, kind: "THREAD_REPLY", bucket: "following", scopeId: ch, streamKey: "t1", streamSeq: 1 });
    const otherScope = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: newObjectId(), streamKey: "root", streamSeq: 1 });

    expect(await repo.markReadByStream(u.id, "CHANNEL", ch, "root", 5)).toEqual([a.rowId]);
    expect(await repo.markReadByStream(u.id, "CHANNEL", ch, "root", 5)).toEqual([]);
    const rows = await prisma.notificationRecipient.findMany({ where: { id: { in: [a.rowId, b.rowId, thread.rowId, otherScope.rowId] } } });
    const readAt = Object.fromEntries(rows.map((r) => [r.id, r.readAt]));
    expect(readAt[a.rowId]).toBeInstanceOf(Date);
    expect(readAt[b.rowId]).toBeNull();
    expect(readAt[thread.rowId]).toBeNull();
    expect(readAt[otherScope.rowId]).toBeNull();
  });

  it("cancelUnreadByScope: mục chưa đọc của scope → inInbox=false + cancelledAt; mục đã đọc/scope khác giữ nguyên", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const ch = newObjectId();
    const unread = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 1 });
    const read = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 2 });
    const other = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: newObjectId(), streamKey: "root", streamSeq: 1 });
    await repo.markRead(u.id, read.rowId);

    expect(await repo.cancelUnreadByScope([u.id], "CHANNEL", ch, new Date())).toBe(1);
    const rows = Object.fromEntries((await prisma.notificationRecipient.findMany({ where: { recipientId: u.id } })).map((r) => [r.id, r]));
    expect(rows[unread.rowId]).toMatchObject({ inInbox: false });
    expect(rows[unread.rowId]?.cancelledAt).toBeInstanceOf(Date);
    expect(rows[read.rowId]?.inInbox).toBe(true);
    expect(rows[other.rowId]?.inInbox).toBe(true);
    expect((await repo.listInbox(u.id, { filter: "all", unreadOnly: false, limit: 10 })).data).toHaveLength(2);
  });

  it("purgeExpired: xoá mục đã đọc/đã huỷ quá hạn + Notification mồ côi; giữ mục chưa đọc và Notification còn người nhận", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const ch = newObjectId();
    const oldRead = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 1, createdAt: new Date(Date.now() - 200 * 86_400_000) });
    const oldCancelled = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 2, createdAt: new Date(Date.now() - 200 * 86_400_000) });
    const oldUnread = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: ch, streamKey: "root", streamSeq: 3, createdAt: new Date(Date.now() - 200 * 86_400_000) });
    const old = new Date(Date.now() - 100 * 86_400_000);
    await prisma.notificationRecipient.update({ where: { id: oldRead.rowId }, data: { readAt: old } });
    await prisma.notificationRecipient.update({ where: { id: oldCancelled.rowId }, data: { inInbox: false, cancelledAt: old } });
    // Notification cũ KHÔNG có người nhận (mồ côi từ đầu)
    const orphan = await prisma.notification.create({
      data: { type: "mention", scopeType: "CHANNEL", scopeId: ch, sourceType: "MESSAGE", sourceId: "orphan", dedupeKey: `msg:${newObjectId()}`, createdAt: new Date(Date.now() - 200 * 86_400_000) },
    });
    notificationIds.push(orphan.id);
    await prisma.notification.updateMany({ where: { id: { in: [oldRead.notificationId, oldCancelled.notificationId, oldUnread.notificationId] } }, data: { createdAt: new Date(Date.now() - 200 * 86_400_000) } });

    const result = await repo.purgeExpired(new Date(Date.now() - 90 * 86_400_000));
    expect(result.recipients).toBe(2);
    expect(result.notifications).toBe(3); // 2 Notification vừa mất người nhận + 1 mồ côi
    expect(await prisma.notificationRecipient.findUnique({ where: { id: oldRead.rowId } })).toBeNull();
    expect(await prisma.notificationRecipient.findUnique({ where: { id: oldCancelled.rowId } })).toBeNull();
    expect(await prisma.notificationRecipient.findUnique({ where: { id: oldUnread.rowId } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: oldUnread.notificationId } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: orphan.id } })).toBeNull();
  });

  it("fanoutRepo.upsertRecipients: chạy lại không nhân đôi; nâng kind THREAD_REPLY → MENTION; khôi phục mục đã huỷ", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const ch = newObjectId();
    const msgId = newObjectId();
    const dedupeKey = `msg:${msgId}`;
    const notificationId = await fanoutRepo.upsertMessageNotification({
      dedupeKey, type: "thread.reply", scopeType: "CHANNEL", scopeId: ch, workspaceId: null, actorId: null, messageId: msgId, threadId: null, seq: 4,
    });
    notificationIds.push(notificationId);
    expect(await fanoutRepo.upsertMessageNotification({ dedupeKey, type: "mention", scopeType: "CHANNEL", scopeId: ch, workspaceId: null, actorId: null, messageId: msgId, threadId: null, seq: 4 })).toBe(notificationId);

    const base = { notificationId, dedupeKey, scopeType: "CHANNEL" as const, scopeId: ch, workspaceId: null, streamKey: "root", streamSeq: 4 };
    const [first] = await fanoutRepo.upsertRecipients({ ...base, rows: [{ userId: u.id, kind: "THREAD_REPLY", kindRank: 60, filterBucket: "following" }] });
    expect(first).toMatchObject({ created: true, upgraded: false });

    const [same] = await fanoutRepo.upsertRecipients({ ...base, rows: [{ userId: u.id, kind: "THREAD_REPLY", kindRank: 60, filterBucket: "following" }] });
    expect(same).toMatchObject({ created: false, upgraded: false, recipientRowId: first?.recipientRowId });

    const [up] = await fanoutRepo.upsertRecipients({ ...base, rows: [{ userId: u.id, kind: "MENTION", kindRank: 100, filterBucket: "mentions" }] });
    expect(up).toMatchObject({ created: false, upgraded: true });
    expect(await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: first!.recipientRowId } })).toMatchObject({ kind: "MENTION", kindRank: 100, filterBucket: "mentions" });

    // Không hạ ngược (MENTION → THREAD_REPLY)
    const [down] = await fanoutRepo.upsertRecipients({ ...base, rows: [{ userId: u.id, kind: "THREAD_REPLY", kindRank: 60, filterBucket: "following" }] });
    expect(down).toMatchObject({ created: false, upgraded: false });
    expect((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: first!.recipientRowId } })).kind).toBe("MENTION");

    // Huỷ rồi thêm lại (sửa tin gỡ rồi nhắc lại) → khôi phục + phát lại notification:created
    await fanoutRepo.cancelRecipients([first!.recipientRowId], new Date());
    const [revived] = await fanoutRepo.upsertRecipients({ ...base, rows: [{ userId: u.id, kind: "MENTION", kindRank: 100, filterBucket: "mentions" }] });
    expect(revived).toMatchObject({ created: true });
    expect(await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: first!.recipientRowId } })).toMatchObject({ inInbox: true, readAt: null });
  });

  it("GET/PUT /me/notification-preferences (dạng mới, không scope): mặc định → chọn → INHERIT workspace; dạng cũ (có scope) vẫn hoạt động", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const owner = await seedUser({ name: "Chủ" });
    userIds.push(owner.id);

    const initial = await request(app).get("/api/v1/me/notification-preferences").set("Authorization", auth(u.id));
    expect(initial.status).toBe(200);
    expect(initial.body.data).toMatchObject({ directMode: "ALL", groupMode: "ALL", channelMode: "MENTIONS_AND_THREADS", lockScreenPreview: "HIDDEN", sound: true, dndUntil: null });

    const put = await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(u.id)).send({ directMode: "MUTED", lockScreenPreview: "SENDER", sound: false });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ directMode: "MUTED", groupMode: "ALL", lockScreenPreview: "SENDER", sound: false });
    const stored = await prisma.notificationPreference.findFirstOrThrow({ where: { userId: u.id, scope: "ACCOUNT" } });
    expect(stored).toMatchObject({ directMode: "MUTED", groupMode: null, channelMode: null, lockScreenLevel: "SENDER", sound: false, lockScreenPreview: false });

    const bad = await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(u.id)).send({ directMode: "MENTIONS" });
    expect(bad.status).toBe(400);
    const pastDnd = await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(u.id)).send({ dndUntil: new Date(Date.now() - 1000).toISOString() });
    expect(pastDnd.status).toBe(400);
    expect(pastDnd.body.error.code).toBe("NOTI_004");

    // Dạng cũ p0-06 (có `scope`) vẫn chạy: đặt MUTED cho 1 workspace
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", auth(owner.id)).set("Idempotency-Key", `idem-${newObjectId()}`).send({ name: "WS pref" });
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, u.id, "MEMBER");
    const legacy = await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(u.id)).send({ scope: "WORKSPACE", scopeId: workspaceId, mode: "MUTED" });
    expect(legacy.status).toBe(200);
    expect(legacy.body.data).toMatchObject({ scope: "WORKSPACE", mode: "MUTED" });
    const legacyGet = await request(app).get(`/api/v1/me/notification-preferences?scope=WORKSPACE&scopeId=${workspaceId}`).set("Authorization", auth(u.id));
    expect(legacyGet.body.data).toMatchObject({ scope: "WORKSPACE", mode: "MUTED" });
  });

  it("GET/PUT /workspaces/:id/notification-preferences: thành viên đặt/đọc; INHERIT xoá; effective kế thừa tài khoản; không phải thành viên → 404", async () => {
    const owner = await seedUser({ name: "Chủ" });
    const member = await seedUser({ name: "Thành viên" });
    const outsider = await seedUser({ name: "Người lạ" });
    userIds.push(owner.id, member.id, outsider.id);
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", auth(owner.id)).set("Idempotency-Key", `idem-${newObjectId()}`).send({ name: "WS pref 2" });
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, member.id, "MEMBER");

    await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(member.id)).send({ groupMode: "MENTIONS_AND_THREADS" });

    const initial = await request(app).get(`/api/v1/workspaces/${workspaceId}/notification-preferences`).set("Authorization", auth(member.id));
    expect(initial.status).toBe(200);
    expect(initial.body.data).toEqual({ workspaceId, groupMode: "INHERIT", channelMode: "INHERIT", effective: { groupMode: "MENTIONS_AND_THREADS", channelMode: "MENTIONS_AND_THREADS" } });

    const put = await request(app).put(`/api/v1/workspaces/${workspaceId}/notification-preferences`).set("Authorization", auth(member.id)).send({ groupMode: "MUTED", channelMode: "ALL" });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ groupMode: "MUTED", channelMode: "ALL", effective: { groupMode: "MUTED", channelMode: "ALL" } });

    const inherit = await request(app).put(`/api/v1/workspaces/${workspaceId}/notification-preferences`).set("Authorization", auth(member.id)).send({ groupMode: "INHERIT" });
    expect(inherit.body.data).toMatchObject({ groupMode: "INHERIT", channelMode: "ALL" });
    expect((await prisma.notificationPreference.findFirstOrThrow({ where: { userId: member.id, scope: "WORKSPACE", scopeKey: workspaceId } })).groupMode).toBeNull();

    expect((await request(app).get(`/api/v1/workspaces/${workspaceId}/notification-preferences`).set("Authorization", auth(outsider.id))).status).toBe(404);
    expect((await request(app).put(`/api/v1/workspaces/${workspaceId}/notification-preferences`).set("Authorization", auth(member.id)).send({ groupMode: "MENTIONS" })).status).toBe(400);
  });

  it("POST /notifications/read-all: before tương lai xa → NOTI_003; POST /notifications/:id/read trả { id, readAt }", async () => {
    const u = await seedUser({ name: "U" });
    userIds.push(u.id);
    const row = await seedRow({ recipientId: u.id, kind: "MENTION", bucket: "mentions", scopeId: newObjectId(), streamKey: "root", streamSeq: 1 });

    const future = await request(app).post("/api/v1/notifications/read-all").set("Authorization", auth(u.id)).send({ filter: "all", before: new Date(Date.now() + 3_600_000).toISOString() });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe("NOTI_003");

    const read = await request(app).post(`/api/v1/notifications/${row.rowId}/read`).set("Authorization", auth(u.id));
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ id: row.rowId });
    expect(read.body.data.readAt).toBeTruthy();
  });
});
