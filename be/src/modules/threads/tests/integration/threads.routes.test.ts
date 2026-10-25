/**
 * Integration — thread & mention p1-06 trên Prisma THẬT (Mongo memory replset,
 * `TEST_DB=memory`), Redis mock STATEFUL + Socket.IO thật (`startHarness`), kênh
 * (p1-03) + hội thoại (p1-05) + engine `messages` (p1-04) + `threads` + `mentions`
 * cùng chạy — kiểm đường THẬT mà unit không bắt được (unique index Thread → race
 * TH-01, composite type, transaction, outbox row).
 *
 * Nghiệm thu phủ ở đây: TH-01, TH-02, TH-04, TH-05, MSG-30, MSG-31, MSG-32 (quota
 * qua Redis), MSG-33 (diff trong outbox), MSG-34, MSG-35, MSG-36, CH-06 (reply bị
 * chặn ở ADMINS_ONLY), ghép tóm tắt thread vào MessageView (list/get).
 * TH-03/TH-06 (thông báo MENTION, 1 NotificationRecipient/người/tin): chạy THẬT
 * `FanoutService` của p1-07 (`notification-wiring.getFanoutService()`) trên đúng payload outbox
 * `fanout.message` do `send()` ghi — relay/BullMQ không chạy trong Jest nên job được gọi tay.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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
    incrBy: jest.fn(),
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
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import mentionsRoutes from "../../../mentions/mentions.routes";
import { getFanoutService } from "../../../notifications/services/notification-wiring";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerMentionsModule } from "../../../mentions";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import notificationsRoutes from "../../../notifications/notifications.routes";
import threadsRoutes from "../../threads.routes";
import { registerThreadsModule } from "../../index";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", threadsRoutes);
  app.use("/api/v1", mentionsRoutes);
  app.use("/api/v1", notificationsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

// Mỗi test gọi nhiều request HTTP tuần tự (tạo workspace + kênh + gửi tin…) trên Mongo memory
// replset — mặc định 5 giây của Jest không đủ trên máy tầm trung.
jest.setTimeout(60_000);

const auth = (userId: string): string => `Bearer ${tokenFor(userId)}`;
const marker = (id: string): string => `@{u:${id}}`;

describe("threads & mentions (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    registerThreadsModule();
    registerMentionsModule();

    // `MongoMemoryReplSet` KHÔNG tự áp index từ schema.prisma — tự tạo các unique
    // index mà nghiệp vụ dựa vào (Thread.parentMessageId cho race TH-01, cặp
    // (threadId,userId) của ThreadSubscription, dedupeKey/seq của Message...).
    await prisma.$runCommandRaw({
      createIndexes: "NotificationRecipient",
      indexes: [{ key: { recipientId: 1, dedupeKey: 1 }, name: "NotificationRecipient_recipientId_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Notification",
      indexes: [{ key: { dedupeKey: 1 }, name: "Notification_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Thread",
      indexes: [{ key: { parentMessageId: 1 }, name: "Thread_parentMessageId_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "ThreadSubscription",
      indexes: [{ key: { threadId: 1, userId: 1 }, name: "ThreadSubscription_threadId_userId_key", unique: true }],
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

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    const channelIds = (
      await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })
    ).map((c) => c.id);
    const scopeIds = [...channelIds, ...conversationIds];
    if (scopeIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: scopeIds } } });
      await prisma.messageHide.deleteMany({ where: { scopeId: { in: scopeIds } } });
    }
    await prisma.notificationRecipient.deleteMany({ where: { OR: [{ workspaceId: { in: workspaceIds } }, { recipientId: { in: userIds } }] } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.threadSubscription.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.thread.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Message", "Channel", "Conversation"] } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: workspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) } });
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
    conversationIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  async function newUser(name: string): Promise<string> {
    const u = await seedUser({ name });
    // `seedUser` để normalizedName rỗng — mentionables lọc `q` theo trường này (đúng như production).
    await prisma.user.update({ where: { id: u.id }, data: { normalizedName: normalizeSearch(name) } });
    userIds.push(u.id);
    return u.id;
  }

  /** Workspace do `ownerId` tạo + các `memberIds` là MEMBER ACTIVE. */
  async function newWorkspace(ownerId: string, memberIds: string[] = []): Promise<string> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(ownerId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm thread & mention" });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const id of memberIds) await addMembership(workspaceId, id, "MEMBER");
    return workspaceId;
  }

  async function newChannel(
    ownerId: string,
    workspaceId: string,
    body: { visibility?: "PUBLIC" | "PRIVATE"; postingPolicy?: "MEMBERS" | "ADMINS_ONLY"; initialMemberIds?: string[] } = {}
  ): Promise<string> {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(ownerId))
      .send({ name: `Kênh ${randomUUID().slice(0, 8)}`, visibility: "PUBLIC", ...body });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function newGroup(ownerId: string, workspaceId: string, memberIds: string[]): Promise<string> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", auth(ownerId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm chat thread", memberIds });
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    conversationIds.push(id);
    return id;
  }

  function send(
    userId: string,
    scopeType: "CHANNEL" | "CONVERSATION",
    scopeId: string,
    body: { content?: string; mentions?: Array<{ type: string; targetId?: string }>; threadRootId?: string } = {}
  ) {
    return request(app)
      .post(`/api/v1/scopes/${scopeType}/${scopeId}/messages`)
      .set("Authorization", auth(userId))
      .send({ clientMessageId: randomUUID(), content: "Nội dung thử", ...body });
  }

  async function sendOk(...args: Parameters<typeof send>): Promise<{ id: string; seq: number; [k: string]: unknown }> {
    const res = await send(...args);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  /** Tiền cảnh chung: owner + 2 member trong 1 workspace + 1 kênh public + 1 tin gốc của owner. */
  async function channelWithRoot() {
    const owner = await newUser("Chủ nhóm");
    const m1 = await newUser("Thành viên 1");
    const m2 = await newUser("Thành viên 2");
    const workspaceId = await newWorkspace(owner, [m1, m2]);
    const channelId = await newChannel(owner, workspaceId);
    const root = await sendOk(owner, "CHANNEL", channelId, { content: "Tin gốc" });
    return { owner, m1, m2, workspaceId, channelId, root };
  }

  // ── TH-01 / TH-02 / TH-04 ──────────────────────────────────────────────────
  it("TH-01: hai người gửi reply ĐẦU đồng thời → đúng MỘT Thread, replyCount=2, seq luồng thread 1 và 2", async () => {
    const { m1, m2, channelId, root } = await channelWithRoot();

    const [r1, r2] = await Promise.all([
      send(m1, "CHANNEL", channelId, { content: "Reply A", threadRootId: root.id }),
      send(m2, "CHANNEL", channelId, { content: "Reply B", threadRootId: root.id }),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect([r1.body.data.seq, r2.body.data.seq].sort()).toEqual([1, 2]);
    expect(r1.body.data.threadId).toBe(root.id);

    const threads = await prisma.thread.findMany({ where: { parentMessageId: root.id } });
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ replyCount: 2, lastReplySeq: 2, channelId });
    expect([...threads[0].lastReplierIds].sort()).toEqual([m1, m2].sort());
    expect(threads[0].subscriberCount).toBe(2); // 2 tác giả reply → AUTO_ON
  }, 30_000);

  it("TH-02: mở thread nhưng chưa trả lời → KHÔNG có Thread; GET /messages/:id/thread trả thread=null, replies rỗng", async () => {
    const { m1, root } = await channelWithRoot();
    const res = await request(app).get(`/api/v1/messages/${root.id}/thread`).set("Authorization", auth(m1));
    expect(res.status).toBe(200);
    expect(res.body.data.thread).toBeNull();
    expect(res.body.data.replies).toEqual([]);
    expect(res.body.data.root).toMatchObject({ id: root.id, threadId: null });
    expect(await prisma.thread.count({ where: { parentMessageId: root.id } })).toBe(0);
  });

  it("TH-04: đã EXPLICIT_OFF rồi tự trả lời → VẪN EXPLICIT_OFF; GET /threads/:id phản ánh mySubscription", async () => {
    const { m1, channelId, root } = await channelWithRoot();
    const first = await sendOk(m1, "CHANNEL", channelId, { threadRootId: root.id });
    expect(first.threadId).toBe(root.id);

    const thread = await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: root.id } });
    const before = await request(app).get(`/api/v1/threads/${thread.id}`).set("Authorization", auth(m1));
    expect(before.body.data).toMatchObject({ mySubscription: "AUTO_ON", replyCount: 1, parentMessageId: root.id });

    const off = await request(app)
      .put(`/api/v1/threads/${thread.id}/subscription`)
      .set("Authorization", auth(m1))
      .send({ state: "EXPLICIT_OFF" });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ threadId: thread.id, state: "EXPLICIT_OFF" });

    await sendOk(m1, "CHANNEL", channelId, { threadRootId: root.id });
    const after = await request(app).get(`/api/v1/threads/${thread.id}`).set("Authorization", auth(m1));
    expect(after.body.data).toMatchObject({ mySubscription: "EXPLICIT_OFF", replyCount: 2 });
    expect(await prisma.threadSubscription.count({ where: { threadId: thread.id, userId: m1 } })).toBe(1);
  });

  // ── TH-05 / MSG-34 / MSG-36 (mention) ──────────────────────────────────────
  it("TH-05: mention người ngoài kênh private / marker không có entry → 400 MSG_008, KHÔNG tạo tin, KHÔNG có outbox", async () => {
    const owner = await newUser("Chủ kênh riêng");
    const insider = await newUser("Người trong kênh");
    const outsider = await newUser("Người ngoài kênh");
    const workspaceId = await newWorkspace(owner, [insider, outsider]);
    const channelId = await newChannel(owner, workspaceId, { visibility: "PRIVATE", initialMemberIds: [insider] });

    // (a) target trong workspace nhưng KHÔNG có grant kênh private
    const noAccess = await send(owner, "CHANNEL", channelId, {
      content: `Chào ${marker(outsider)}`,
      mentions: [{ type: "USER", targetId: outsider }],
    });
    expect(noAccess.status).toBe(400);
    expect(noAccess.body.error.code).toBe("MSG_008");
    expect(noAccess.body.error.details).toEqual({
      reason: "INVALID_TARGET",
      invalidMentions: [{ targetId: outsider, reason: "NO_ACCESS" }],
    });

    // (b) marker trong nội dung nhưng mentions[] rỗng (payload giả)
    const mismatch = await send(owner, "CHANNEL", channelId, { content: `Chào ${marker(insider)}`, mentions: [] });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toMatchObject({ code: "MSG_008", details: { reason: "MISMATCH" } });

    // (c) entry có nhưng không có marker
    const noMarker = await send(owner, "CHANNEL", channelId, { content: "Không có marker", mentions: [{ type: "USER", targetId: insider }] });
    expect(noMarker.body.error).toMatchObject({ code: "MSG_008", details: { reason: "MISMATCH" } });

    expect(await prisma.message.count({ where: { scopeId: channelId } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { type: "message.created", aggregateType: "Message" } })).toBe(0);

    // đối chứng: tag người CÓ grant → thành công
    const ok = await send(owner, "CHANNEL", channelId, { content: `Chào ${marker(insider)}`, mentions: [{ type: "USER", targetId: insider }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.mentions).toEqual([{ type: "USER", targetId: insider, label: "Người trong kênh" }]);
  });

  it("MSG-34: 2 người cùng tên 'Minh', tag MỘT người → đúng người đó nhận (mentions + outbox mentionUserIds theo id)", async () => {
    const owner = await newUser("Chủ nhóm");
    const minhA = await newUser("Minh");
    const minhB = await newUser("Minh");
    const workspaceId = await newWorkspace(owner, [minhA, minhB]);
    const channelId = await newChannel(owner, workspaceId);

    const msg = await sendOk(owner, "CHANNEL", channelId, {
      content: `Nhờ ${marker(minhB)} xem giúp`,
      mentions: [{ type: "USER", targetId: minhB }],
    });
    expect(msg.mentions).toEqual([{ type: "USER", targetId: minhB, label: "Minh" }]);

    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "message.created", aggregateId: msg.id } });
    expect(event.payload).toMatchObject({ mentionUserIds: [minhB], mentionAll: false, authorId: owner });
    // normalizedContent tìm được theo TÊN lúc gửi, không chứa marker thô
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(stored.normalizedContent).toBe("nho @minh xem giup");
  });

  it("tự tag chính mình: giữ trong mentions nhưng KHÔNG nằm trong outbox mentionUserIds (không tạo thông báo)", async () => {
    const { owner, channelId } = await channelWithRoot();
    const msg = await sendOk(owner, "CHANNEL", channelId, { content: `Note ${marker(owner)}`, mentions: [{ type: "USER", targetId: owner }] });
    expect(msg.mentions).toHaveLength(1);
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "message.created", aggregateId: msg.id } });
    expect(event.payload).toMatchObject({ mentionUserIds: [] });
  });

  it("MSG-36: mentionables kênh PRIVATE chỉ gồm người có grant, KHÔNG có email; người ngoài kênh gọi → 404", async () => {
    const owner = await newUser("Chủ kênh riêng");
    const insider = await newUser("Người trong kênh");
    const outsider = await newUser("Người ngoài kênh");
    const workspaceId = await newWorkspace(owner, [insider, outsider]);
    const channelId = await newChannel(owner, workspaceId, { visibility: "PRIVATE", initialMemberIds: [insider] });

    const res = await request(app).get(`/api/v1/scopes/CHANNEL/${channelId}/mentionables`).set("Authorization", auth(owner));
    expect(res.status).toBe(200);
    const users = res.body.data.users as Array<Record<string, unknown>>;
    expect(users.map((u) => u.userId).sort()).toEqual([owner, insider].sort());
    expect(users.map((u) => u.userId)).not.toContain(outsider);
    for (const u of users) expect(Object.keys(u)).not.toContain("email");
    expect(JSON.stringify(res.body)).not.toContain("@e.com");
    expect(res.body.data.canMentionAll).toBe(false);

    const filtered = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/mentionables`)
      .query({ q: "trong" })
      .set("Authorization", auth(owner));
    expect((filtered.body.data.users as Array<{ userId: string }>).map((u) => u.userId)).toEqual([insider]);

    const denied = await request(app).get(`/api/v1/scopes/CHANNEL/${channelId}/mentionables`).set("Authorization", auth(outsider));
    expect(denied.status).toBe(404);
  });

  // ── MSG-30 / MSG-31 / CH-06 (điều kiện tạo reply) ──────────────────────────
  it("MSG-30: gửi threadRootId trong HỘI THOẠI → 400 MSG_018, không tạo tin", async () => {
    const owner = await newUser("Chủ nhóm chat");
    const m1 = await newUser("Thành viên nhóm chat");
    const workspaceId = await newWorkspace(owner, [m1]);
    const conversationId = await newGroup(owner, workspaceId, [m1]);
    const first = await sendOk(owner, "CONVERSATION", conversationId, { content: "Tin trong nhóm chat" });
    const before = await prisma.message.count({ where: { scopeId: conversationId } }); // gồm cả tin hệ thống tạo nhóm

    const res = await send(m1, "CONVERSATION", conversationId, { threadRootId: first.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MSG_018");
    expect(await prisma.message.count({ where: { scopeId: conversationId } })).toBe(before);
  });

  it("MSG-31: reply vào một reply (threadRootId = reply) → 400 MSG_019", async () => {
    const { m1, m2, channelId, root } = await channelWithRoot();
    const reply = await sendOk(m1, "CHANNEL", channelId, { threadRootId: root.id });

    const nested = await send(m2, "CHANNEL", channelId, { threadRootId: reply.id });
    expect(nested.status).toBe(400);
    expect(nested.body.error.code).toBe("MSG_019");
    expect(await prisma.thread.count({ where: { parentMessageId: reply.id } })).toBe(0);
  });

  it("threadRootId của tin không tồn tại / tin kênh khác → 409 MSG_006", async () => {
    const { owner, m1, workspaceId, channelId } = await channelWithRoot();
    const otherChannel = await newChannel(owner, workspaceId);
    const foreignRoot = await sendOk(owner, "CHANNEL", otherChannel, { content: "Kênh khác" });

    const missing = await send(m1, "CHANNEL", channelId, { threadRootId: "1".repeat(24) });
    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe("MSG_006");
    const foreign = await send(m1, "CHANNEL", channelId, { threadRootId: foreignRoot.id });
    expect(foreign.body.error.code).toBe("MSG_006");
  });

  it("CH-06: MEMBER ở kênh ADMINS_ONLY reply bị chặn 403 MSG_004 nhưng vẫn ĐỌC được thread", async () => {
    const owner = await newUser("Chủ nhóm");
    const m1 = await newUser("Thành viên");
    const workspaceId = await newWorkspace(owner, [m1]);
    const channelId = await newChannel(owner, workspaceId, { postingPolicy: "ADMINS_ONLY" });
    const root = await sendOk(owner, "CHANNEL", channelId, { content: "Thông báo của quản trị" });

    const blocked = await send(m1, "CHANNEL", channelId, { threadRootId: root.id });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("MSG_004");

    const read = await request(app).get(`/api/v1/messages/${root.id}/thread`).set("Authorization", auth(m1));
    expect(read.status).toBe(200);
    expect(await prisma.thread.count({ where: { parentMessageId: root.id } })).toBe(0);
  });

  it("người ngoài workspace / ngoài kênh private mở thread → 404 trung tính", async () => {
    const owner = await newUser("Chủ kênh riêng");
    const insider = await newUser("Người trong kênh");
    const outsider = await newUser("Người ngoài");
    const workspaceId = await newWorkspace(owner, [insider]);
    const channelId = await newChannel(owner, workspaceId, { visibility: "PRIVATE", initialMemberIds: [insider] });
    const root = await sendOk(owner, "CHANNEL", channelId, { content: "Riêng tư" });
    const reply = await sendOk(insider, "CHANNEL", channelId, { threadRootId: root.id });
    const thread = await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: root.id } });

    for (const path of [`/api/v1/messages/${root.id}/thread`, `/api/v1/threads/${thread.id}`]) {
      const res = await request(app).get(path).set("Authorization", auth(outsider));
      expect(res.status).toBe(404);
    }
    const put = await request(app)
      .put(`/api/v1/threads/${thread.id}/subscription`)
      .set("Authorization", auth(outsider))
      .send({ state: "EXPLICIT_ON" });
    expect(put.status).toBe(404);
    expect(reply.threadId).toBe(root.id);
  });

  // ── MSG-32 (@all) ───────────────────────────────────────────────────────────
  it("MSG-32: @all — MEMBER khi mentionAllRole=ADMIN → 403 MSG_020; OWNER gửi được; vượt 5 lần/giờ → 429 MSG_021; ở KÊNH → 403 MSG_020", async () => {
    const owner = await newUser("Chủ nhóm chat");
    const m1 = await newUser("Thành viên nhóm chat");
    const workspaceId = await newWorkspace(owner, [m1]);
    const conversationId = await newGroup(owner, workspaceId, [m1]);
    const allBody = { content: "Chú ý @{all}", mentions: [{ type: "ALL" }] };
    const messagesBefore = await prisma.message.count({ where: { scopeId: conversationId } }); // tin hệ thống tạo nhóm

    const memberTry = await send(m1, "CONVERSATION", conversationId, allBody);
    expect(memberTry.status).toBe(403);
    expect(memberTry.body.error.code).toBe("MSG_020");

    const ownerOk = await send(owner, "CONVERSATION", conversationId, allBody);
    expect(ownerOk.status).toBe(201);
    expect(ownerOk.body.data.mentions).toEqual([{ type: "ALL", targetId: null, label: null }]);
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "message.created", aggregateId: ownerOk.body.data.id } });
    expect(event.payload).toMatchObject({ mentionAll: true, mentionUserIds: [], scopeType: "CONVERSATION" });

    // Đã dùng 5 lượt trong giờ này → lượt thứ 6 bị chặn (đặt sẵn bộ đếm thay vì gửi 6 tin
    // liên tiếp — sẽ va giới hạn tốc độ gửi tin 5 tin/5 giây, một cơ chế khác).
    store.redisStore.set(`mention-all:${owner}:${conversationId}`, 5);
    const sixth = await send(owner, "CONVERSATION", conversationId, allBody);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("MSG_021");
    expect(sixth.body.error.details).toEqual({ retryAfterSeconds: 3600 });
    expect(await prisma.message.count({ where: { scopeId: conversationId } })).toBe(messagesBefore + 1); // chỉ tin @all đầu, lượt thứ 6 KHÔNG tạo tin

    const channelId = await newChannel(owner, workspaceId);
    const inChannel = await send(owner, "CHANNEL", channelId, allBody);
    expect(inChannel.status).toBe(403);
    expect(inChannel.body.error.code).toBe("MSG_020");
  });

  it("mentionables nhóm chat: OWNER thấy canMentionAll + allCount = số thành viên − 1; MEMBER thì không", async () => {
    const owner = await newUser("Chủ nhóm chat");
    const m1 = await newUser("Thành viên A");
    const m2 = await newUser("Thành viên B");
    const workspaceId = await newWorkspace(owner, [m1, m2]);
    const conversationId = await newGroup(owner, workspaceId, [m1, m2]);

    const asOwner = await request(app).get(`/api/v1/scopes/CONVERSATION/${conversationId}/mentionables`).set("Authorization", auth(owner));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toMatchObject({ canMentionAll: true, allCount: 2 });
    expect((asOwner.body.data.users as unknown[]).length).toBe(3);

    const asMember = await request(app).get(`/api/v1/scopes/CONVERSATION/${conversationId}/mentionables`).set("Authorization", auth(m1));
    expect(asMember.body.data.canMentionAll).toBe(false);
    expect(asMember.body.data).not.toHaveProperty("allCount");
  });

  // ── MSG-33 (sửa tin) ────────────────────────────────────────────────────────
  it("MSG-33: sửa tin THÊM B, BỎ C → outbox message.updated mang mentionDiff {added:[B], removed:[C]}", async () => {
    const owner = await newUser("Chủ nhóm");
    const userB = await newUser("Bình");
    const userC = await newUser("Cường");
    const workspaceId = await newWorkspace(owner, [userB, userC]);
    const channelId = await newChannel(owner, workspaceId);

    const msg = await sendOk(owner, "CHANNEL", channelId, { content: `Chào ${marker(userC)}`, mentions: [{ type: "USER", targetId: userC }] });
    const edited = await request(app)
      .patch(`/api/v1/messages/${msg.id}`)
      .set("Authorization", auth(owner))
      .send({ content: `Chào ${marker(userB)}`, mentions: [{ type: "USER", targetId: userB }], expectedVersion: 1 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.mentions).toEqual([{ type: "USER", targetId: userB, label: "Bình" }]);

    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "message.updated", aggregateId: msg.id } });
    expect(event.payload).toMatchObject({
      reason: "EDIT",
      mentionDiff: { addedUserIds: [userB], removedUserIds: [userC], allAdded: false, allRemoved: false },
    });

    // Sửa thành mention người không thuộc kênh/không tồn tại → 400 MSG_008, tin giữ nguyên bản trước.
    const ghost = "9".repeat(24);
    const bad = await request(app)
      .patch(`/api/v1/messages/${msg.id}`)
      .set("Authorization", auth(owner))
      .send({ content: `Chào ${marker(ghost)}`, mentions: [{ type: "USER", targetId: ghost }], expectedVersion: 2 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("MSG_008");
    expect((await prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).version).toBe(2);
  });

  // ── Tóm tắt thread trong MessageView + MSG-35 ───────────────────────────────
  it("reply KHÔNG hiện ở luồng chính; tin gốc trong list/get/thread có replyCount, lastReplyAt, lastReplierIds, lastReplySeq", async () => {
    const { owner, m1, m2, channelId, root } = await channelWithRoot();
    const plain = await sendOk(owner, "CHANNEL", channelId, { content: "Tin không thread" });
    await sendOk(m1, "CHANNEL", channelId, { content: "Reply 1", threadRootId: root.id });
    await sendOk(m2, "CHANNEL", channelId, { content: "Reply 2", threadRootId: root.id });
    const last = await sendOk(m1, "CHANNEL", channelId, { content: "Reply 3", threadRootId: root.id });

    const list = await request(app).get(`/api/v1/channels/${channelId}/messages`).set("Authorization", auth(owner));
    expect(list.status).toBe(200);
    const items = list.body.data as Array<Record<string, unknown>>;
    expect(items.map((m) => m.id)).toEqual([root.id, plain.id]); // 3 reply không xuất hiện ở luồng chính
    const rootView = items.find((m) => m.id === root.id) as Record<string, unknown>;
    expect(rootView).toMatchObject({ replyCount: 3, lastReplierIds: [m1, m2], lastReplySeq: 3, lastReplyAt: expect.any(String) });
    expect(new Date(rootView.lastReplyAt as string).getTime()).toBeGreaterThan(0);
    const plainView = items.find((m) => m.id === plain.id) as Record<string, unknown>;
    expect(plainView).not.toHaveProperty("replyCount");
    expect(last.seq).toBe(3);

    const got = await request(app).get(`/api/v1/messages/${root.id}`).set("Authorization", auth(m2));
    expect(got.body.data).toMatchObject({ replyCount: 3, lastReplierIds: [m1, m2], lastReplySeq: 3 });

    const thread = await request(app).get(`/api/v1/messages/${root.id}/thread`).set("Authorization", auth(m2));
    expect(thread.status).toBe(200);
    expect(thread.body.data.root).toMatchObject({ id: root.id, replyCount: 3 });
    expect(thread.body.data.thread).toMatchObject({ replyCount: 3, mySubscription: "AUTO_ON", parentMessageId: root.id });
    expect((thread.body.data.replies as Array<{ seq: number }>).map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(thread.body.meta).toMatchObject({ hasMoreBefore: false, hasMoreAfter: false });

    // Danh sách luồng trong kênh (P1): following của m1 gồm thread này; người chưa reply thì rỗng.
    const following = await request(app).get(`/api/v1/channels/${channelId}/threads`).query({ filter: "following" }).set("Authorization", auth(m1));
    expect(following.status).toBe(200);
    expect(following.body.data).toHaveLength(1);
    const none = await request(app).get(`/api/v1/channels/${channelId}/threads`).query({ filter: "following" }).set("Authorization", auth(owner));
    expect(none.body.data).toEqual([]);
    const all = await request(app).get(`/api/v1/channels/${channelId}/threads`).query({ filter: "all" }).set("Authorization", auth(owner));
    expect(all.body.data).toHaveLength(1);
  });

  it("MSG-35: thu hồi tin gốc có 4 reply → tombstone vẫn mở thread, replyCount giữ 4, vẫn reply tiếp được", async () => {
    const { owner, m1, m2, channelId, root } = await channelWithRoot();
    for (const [who, i] of [[m1, 1], [m2, 2], [m1, 3], [m2, 4]] as const) {
      await sendOk(who, "CHANNEL", channelId, { content: `Reply ${i}`, threadRootId: root.id });
    }

    const recall = await request(app).delete(`/api/v1/messages/${root.id}`).set("Authorization", auth(owner)).send({});
    expect(recall.status).toBe(200);

    const thread = await request(app).get(`/api/v1/messages/${root.id}/thread`).set("Authorization", auth(m1));
    expect(thread.status).toBe(200);
    expect(thread.body.data.root).toMatchObject({ id: root.id, deleted: true, content: null, mentions: [], replyCount: 4 });
    expect(thread.body.data.thread).toMatchObject({ replyCount: 4 });
    expect(thread.body.data.replies).toHaveLength(4);

    const list = await request(app).get(`/api/v1/channels/${channelId}/messages`).set("Authorization", auth(m1));
    expect((list.body.data as Array<Record<string, unknown>>).find((m) => m.id === root.id)).toMatchObject({ deleted: true, replyCount: 4 });

    const another = await send(m2, "CHANNEL", channelId, { content: "Reply vào tombstone", threadRootId: root.id });
    expect(another.status).toBe(201);
    expect((await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: root.id } })).replyCount).toBe(5);
  });

  it("GET /messages/:id/thread trên tin thuộc hội thoại → 400 MSG_018; trên 1 reply → 400 MSG_019", async () => {
    const owner = await newUser("Chủ nhóm");
    const m1 = await newUser("Thành viên");
    const workspaceId = await newWorkspace(owner, [m1]);
    const channelId = await newChannel(owner, workspaceId);
    const conversationId = await newGroup(owner, workspaceId, [m1]);
    const chatMessage = await sendOk(owner, "CONVERSATION", conversationId, { content: "Tin nhóm chat" });
    const root = await sendOk(owner, "CHANNEL", channelId, { content: "Gốc" });
    const reply = await sendOk(m1, "CHANNEL", channelId, { threadRootId: root.id });

    const conv = await request(app).get(`/api/v1/messages/${chatMessage.id}/thread`).set("Authorization", auth(owner));
    expect(conv.status).toBe(400);
    expect(conv.body.error.code).toBe("MSG_018");
    const nested = await request(app).get(`/api/v1/messages/${reply.id}/thread`).set("Authorization", auth(owner));
    expect(nested.status).toBe(400);
    expect(nested.body.error.code).toBe("MSG_019");
  });

  // ── Thông báo do fan-out p1-07 quyết định (TH-03 / TH-06) ──────────────────────
  /** Chạy job `fanout.message` với ĐÚNG payload dòng outbox `send()` đã ghi (relay/BullMQ thật không chạy trong Jest). */
  async function runFanout(messageId: string): Promise<void> {
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "fanout.message", aggregateId: messageId } });
    await getFanoutService().fanoutMessage(row.payload as never);
  }

  it("TH-03: được tag trong reply, chưa theo dõi → có thông báo MENTION; reply sau (không tag) không báo người đó", async () => {
    const { owner, m1, m2, channelId, root } = await channelWithRoot();
    const first = await sendOk(m1, "CHANNEL", channelId, { content: "Reply đầu", threadRootId: root.id });
    const tagged = await sendOk(m1, "CHANNEL", channelId, {
      content: `Nhờ ${marker(m2)} xem giúp`,
      mentions: [{ type: "USER", targetId: m2 }],
      threadRootId: root.id,
    });
    const later = await sendOk(m1, "CHANNEL", channelId, { content: "Reply sau, không tag ai", threadRootId: root.id });
    for (const m of [first, tagged, later]) await runFanout(m.id);

    // m2 chưa theo dõi thread (tag không tự theo dõi): CHỈ có mục cho tin có tag
    const rowsM2 = await prisma.notificationRecipient.findMany({ where: { recipientId: m2 } });
    expect(rowsM2).toHaveLength(1);
    expect(rowsM2[0]).toMatchObject({
      dedupeKey: `msg:${tagged.id}`, kind: "MENTION", kindRank: 100, filterBucket: "mentions", inInbox: true, readAt: null,
      scopeType: "CHANNEL", scopeId: channelId, streamKey: root.id, streamSeq: tagged.seq,
    });
    expect(await prisma.threadSubscription.count({ where: { threadId: (await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: root.id } })).id, userId: m2 } })).toBe(0);

    // Đối chứng (README p1-06 §2): tác giả tin gốc nhận FIRST_REPLY MỘT lần và KHÔNG tự theo dõi → reply sau không báo
    const rowsOwner = await prisma.notificationRecipient.findMany({ where: { recipientId: owner }, orderBy: { streamSeq: "asc" } });
    expect(rowsOwner.map((r) => r.kind)).toEqual(["FIRST_REPLY"]);
    expect(rowsOwner[0]).toMatchObject({ dedupeKey: `msg:${first.id}`, filterBucket: "following" });

    // API hộp thư của m2: 1 mục MENTION, ngữ cảnh đúng luồng
    const inbox = await request(app).get("/api/v1/notifications?filter=mentions").set("Authorization", auth(m2));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ kind: "MENTION", messageId: tagged.id, threadId: root.id, context: { available: true } });
  }, 60_000);

  it("TH-06: vừa theo dõi thread vừa bị tag → đúng MỘT NotificationRecipient kind MENTION (kể cả khi job chạy lại)", async () => {
    const { m1, m2, channelId, root } = await channelWithRoot();
    await sendOk(m2, "CHANNEL", channelId, { content: "m2 trả lời → tự động theo dõi", threadRootId: root.id });
    const tagged = await sendOk(m1, "CHANNEL", channelId, {
      content: `Nhắc ${marker(m2)} và lần nữa ${marker(m2)}`,
      mentions: [{ type: "USER", targetId: m2 }],
      threadRootId: root.id,
    });

    await runFanout(tagged.id);
    await runFanout(tagged.id); // job retry

    const rows = await prisma.notificationRecipient.findMany({ where: { recipientId: m2, dedupeKey: `msg:${tagged.id}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "MENTION", kindRank: 100, filterBucket: "mentions" });
    expect(await prisma.notification.count({ where: { dedupeKey: `msg:${tagged.id}` } })).toBe(1);
  }, 60_000);
});
