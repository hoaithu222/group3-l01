/**
 * Integration — p1-07 read-state (Mongo memory replset, `TEST_DB=memory`; Redis mock STATEFUL; Socket.IO THẬT):
 * NT-03 (marker không lùi, 2 marker song song), NT-11 (thiết bị thứ 2 nhận `read:updated` ≤ 2 s), NT-12
 * (job `mark-read-by-stream` → mục hộp thư của tin đã đọc thành đã đọc), NT-13 (đọc-tất-cả không nuốt tin đến sau),
 * `read:receipt` tôn trọng `privacy.readReceipts`, `GET /me/unread/summary` loại hội thoại MUTED, `GET /me/unread`.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    defineCron: jest.fn(),
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
  };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(),
    getdel: jest.fn(), incr: jest.fn(), incrBy: jest.fn(), expire: jest.fn(), exists: jest.fn(), setNx: jest.fn(),
    hset: jest.fn(), hgetall: jest.fn(), hdel: jest.fn(), scanKeys: jest.fn(), getClient: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import {
  startHarness, stopHarness, connectClient, emitWithAck, tokenFor as socketTokenFor, type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import threadsRoutes from "../../../threads/threads.routes";
import mentionsRoutes from "../../../mentions/mentions.routes";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerThreadsModule } from "../../../threads";
import { registerMentionsModule } from "../../../mentions";
import readStateRoutes from "../../read-state.routes";
import { registerReadStateModule } from "../../index";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
// Side-effect: đăng ký processor qua `registerJob` đã mock ở trên.
import "../../../notifications/jobs/mark-read-by-stream.job";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", channelsRoutes);
app.use("/api/v1", conversationsRoutes);
app.use("/api/v1", messagesRoutes);
app.use("/api/v1", threadsRoutes);
app.use("/api/v1", mentionsRoutes);
app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
app.use("/api/v1", readStateRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const store = makeRedisStore();
jest.setTimeout(90_000);
const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor ${queue}/${jobName}`);
  return call[2];
}

function waitForEvent<T>(client: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Hết ${timeoutMs}ms chờ sự kiện ${event}`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function expectNoEvent(client: ClientSocket, event: string, ms = 700): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`Không được nhận sự kiện ${event}`));
    client.once(event, handler);
    setTimeout(() => {
      client.off(event, handler);
      resolve();
    }, ms);
  });
}

describe("p1-07 read-state — /read-markers, /me/read-all-conversations, /me/unread* (integration)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const conversationIds: string[] = [];
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    registerThreadsModule();
    registerMentionsModule();
    registerReadStateModule();
    // MongoMemoryReplSet không chạy `db push` → tự tạo các unique index mà test cần (khớp prisma/schema.prisma).
    await prisma.$runCommandRaw({
      createIndexes: "ReadState",
      indexes: [{ key: { userId: 1, streamType: 1, streamId: 1 }, name: "ReadState_userId_streamType_streamId_key", unique: true }],
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
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    mockEnqueue.mockClear();
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
    const scopeIds = [...channelIds, ...conversationIds];
    if (scopeIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: scopeIds } } });
      await prisma.thread.deleteMany({ where: { channelId: { in: channelIds } } });
      await prisma.threadSubscription.deleteMany({ where: { channelId: { in: channelIds } } });
    }
    await prisma.readState.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Message", "Channel", "Conversation"] } } });
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
  });

  async function connect(userId: string, deviceId: string): Promise<ClientSocket> {
    const client = await connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId });
    clients.push(client);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return client;
  }

  /** Workspace + 2 người (A tác giả, B người đọc) + 1 kênh công khai có B là thành viên kênh. */
  async function setup() {
    const a = await seedUser({ name: "A tác giả" });
    const b = await seedUser({ name: "B người đọc" });
    userIds.push(a.id, b.id);

    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", auth(a.id)).set("Idempotency-Key", `idem-${randomUUID()}`).send({ name: "Nhóm read-state" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, b.id, "MEMBER");

    const ch = await request(app).post(`/api/v1/workspaces/${workspaceId}/channels`).set("Authorization", auth(a.id)).send({ name: "kenh-doc", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    const channelId = ch.body.data.id as string;
    await prisma.channelMembership.create({ data: { channelId, workspaceId, userId: b.id } });
    return { a, b, workspaceId, channelId };
  }

  async function sendChannel(userId: string, channelId: string, content: string, extra: Record<string, unknown> = {}): Promise<{ id: string; seq: number }> {
    const res = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(userId))
      .send({ clientMessageId: randomUUID(), content, ...extra });
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, seq: res.body.data.seq as number };
  }

  async function sendConversation(userId: string, conversationId: string, content: string): Promise<{ id: string; seq: number }> {
    const res = await request(app)
      .post(`/api/v1/scopes/CONVERSATION/${conversationId}/messages`)
      .set("Authorization", auth(userId))
      .send({ clientMessageId: randomUUID(), content });
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, seq: res.body.data.seq as number };
  }

  async function createGroup(creatorId: string, workspaceId: string, memberIds: string[], title: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", auth(creatorId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title, memberIds });
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    conversationIds.push(id);
    return id;
  }

  const mark = (userId: string, body: Record<string, unknown>) =>
    request(app).post("/api/v1/read-markers").set("Authorization", auth(userId)).send(body);

  it("NT-03: marker CHANNEL không lùi; kẹp theo lastSeq; 404 khi không đọc được", async () => {
    const { a, b, channelId } = await setup();
    for (let i = 1; i <= 5; i += 1) await sendChannel(a.id, channelId, `tin ${i}`);

    const first = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 3 });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ streamType: "CHANNEL", streamId: channelId, lastReadSeq: 3, changed: true });

    const older = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 2 });
    expect(older.body.data).toEqual({ streamType: "CHANNEL", streamId: channelId, lastReadSeq: 3, changed: false });

    const clamped = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 999 });
    expect(clamped.body.data.lastReadSeq).toBe(5);

    const outsider = await seedUser({ name: "Người lạ" });
    userIds.push(outsider.id);
    const denied = await mark(outsider.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 1 });
    expect(denied.status).toBe(404);

    const bad = await mark(b.id, { streamType: "CHANNEL", streamId: "khong-phai-objectid", lastReadSeq: 1 });
    expect(bad.status).toBe(400);
  });

  it("NT-03: 2 marker song song (40 & 42 kiểu 4 & 5) → 1 ReadState duy nhất, mốc cuối = lớn nhất", async () => {
    const { a, b, channelId } = await setup();
    for (let i = 1; i <= 5; i += 1) await sendChannel(a.id, channelId, `tin ${i}`);

    const results = await Promise.all(
      [4, 5, 4, 5, 3].map((seq) => mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: seq }))
    );
    for (const r of results) expect(r.status).toBe(200);

    const states = await prisma.readState.findMany({ where: { userId: b.id, streamType: "CHANNEL", streamId: channelId } });
    expect(states).toHaveLength(1);
    expect(states[0]?.lastReadSeq).toBe(5);
    const stale = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 4 });
    expect(stale.body.data.changed).toBe(false);
  });

  it("NT-02: marker THREAD riêng — không đánh dấu kênh; ThreadView có myLastReadSeq/unreadReplies", async () => {
    const { a, b, channelId } = await setup();
    const root = await sendChannel(a.id, channelId, "gốc luồng");
    await sendChannel(b.id, channelId, "reply 1", { threadRootId: root.id });
    await sendChannel(a.id, channelId, "reply 2", { threadRootId: root.id });
    const thread = await prisma.thread.findFirstOrThrow({ where: { parentMessageId: root.id } });
    expect(thread.lastReplySeq).toBe(2);

    const res = await mark(b.id, { streamType: "THREAD", streamId: thread.id, lastReadSeq: 1 });
    expect(res.body.data).toEqual({ streamType: "THREAD", streamId: thread.id, lastReadSeq: 1, changed: true });
    expect(await prisma.readState.count({ where: { userId: b.id, streamType: "CHANNEL" } })).toBe(0);

    const view = await request(app).get(`/api/v1/threads/${thread.id}`).set("Authorization", auth(b.id));
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ myLastReadSeq: 1, unreadReplies: 1 });
  });

  it("CONVERSATION: unreadCount tính lại theo mốc; NT-11: thiết bị thứ 2 nhận read:updated ≤ 2 s; read:receipt tới người kia", async () => {
    const { a, b, workspaceId } = await setup();
    const convId = await createGroup(a.id, workspaceId, [b.id], "Nhóm đọc");
    const t1 = await sendConversation(a.id, convId, "tin 1");
    const t2 = await sendConversation(a.id, convId, "tin 2");
    const t3 = await sendConversation(a.id, convId, "tin 3");
    // Nhóm chat có thể có tin hệ thống lúc tạo (seq trước tin đầu) — unread = mọi tin của người khác sau mốc 0.
    expect((await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: convId, userId: b.id } })).unreadCount).toBe(t3.seq);

    const bTablet = await connect(b.id, "tablet");
    const aPhone = await connect(a.id, "phone-a");
    expect(await emitWithAck<{ ok: boolean }>(aPhone, "room:join", { kind: "conv", id: convId })).toMatchObject({ ok: true });

    const updated = waitForEvent<Record<string, unknown>>(bTablet, "read:updated", 2000);
    const receipt = waitForEvent<Record<string, unknown>>(aPhone, "read:receipt", 2000);
    const res = await mark(b.id, { streamType: "CONVERSATION", streamId: convId, lastReadSeq: t2.seq, deviceId: "phone-b" });
    expect(res.body.data).toEqual({ streamType: "CONVERSATION", streamId: convId, lastReadSeq: t2.seq, changed: true });

    expect(await updated).toMatchObject({ v: 1, streamType: "CONVERSATION", streamId: convId, lastReadSeq: t2.seq, unreadCount: 1, originDeviceId: "phone-b" });
    expect(await receipt).toMatchObject({ conversationId: convId, userId: b.id, lastReadSeq: t2.seq });

    const member = await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: convId, userId: b.id } });
    expect(member).toMatchObject({ lastReadSeq: t2.seq, unreadCount: 1, mentionsSinceRead: 0, markedUnread: false });
    expect(t1.seq).toBeLessThan(t2.seq);

    // Marker cũ → không đổi, không phát lại
    const noEvent = expectNoEvent(bTablet, "read:updated");
    const older = await mark(b.id, { streamType: "CONVERSATION", streamId: convId, lastReadSeq: t1.seq });
    expect(older.body.data).toMatchObject({ lastReadSeq: t2.seq, changed: false });
    await noEvent;
  });

  it("read:receipt KHÔNG phát khi người đọc tắt privacy.readReceipts", async () => {
    const { a, b, workspaceId } = await setup();
    await prisma.user.update({ where: { id: b.id }, data: { privacy: { readReceipts: false, showPresence: true } } });
    const convId = await createGroup(a.id, workspaceId, [b.id], "Nhóm riêng tư đọc");
    const hello = await sendConversation(a.id, convId, "xin chào");

    const aPhone = await connect(a.id, "phone-a");
    await emitWithAck(aPhone, "room:join", { kind: "conv", id: convId });
    const none = expectNoEvent(aPhone, "read:receipt", 800);
    const res = await mark(b.id, { streamType: "CONVERSATION", streamId: convId, lastReadSeq: hello.seq });
    expect(res.body.data.changed).toBe(true);
    await none;
  });

  it("NT-12: marker kênh xếp job mark-read-by-stream → mục hộp thư của tin ≤ seq thành đã đọc + notification:read", async () => {
    const { a, b, workspaceId, channelId } = await setup();
    const m1 = await sendChannel(a.id, channelId, `nhắc @{u:${b.id}}`, { mentions: [{ type: "USER", targetId: b.id }] });
    const m2 = await sendChannel(a.id, channelId, "tin sau");

    // Mục hộp thư do fan-out ghi (mô phỏng trực tiếp): tin m1 (seq 1) — MENTION; tin m2 (seq 2) — MENTION.
    const notification = await prisma.notification.create({
      data: { type: "mention", scopeType: "CHANNEL", scopeId: channelId, workspaceId, actorId: a.id, sourceType: "MESSAGE", sourceId: m1.id, dedupeKey: `msg:${m1.id}`, refs: { messageId: m1.id } },
    });
    const notification2 = await prisma.notification.create({
      data: { type: "mention", scopeType: "CHANNEL", scopeId: channelId, workspaceId, actorId: a.id, sourceType: "MESSAGE", sourceId: m2.id, dedupeKey: `msg:${m2.id}`, refs: { messageId: m2.id } },
    });
    const mkRow = (notificationId: string, dedupeKey: string, streamSeq: number) =>
      prisma.notificationRecipient.create({
        data: {
          notificationId, recipientId: b.id, kind: "MENTION", kindRank: 100, inInbox: true, dedupeKey, scopeType: "CHANNEL", scopeId: channelId,
          workspaceId, streamKey: "root", streamSeq, filterBucket: "mentions", readAt: null, seenAt: null, skipReason: null, deliveredPushAt: null, cancelledAt: null,
        },
      });
    const row1 = await mkRow(notification.id, `msg:${m1.id}`, m1.seq);
    const row2 = await mkRow(notification2.id, `msg:${m2.id}`, m2.seq);

    const bTablet = await connect(b.id, "tablet");
    const readEvent = waitForEvent<{ ids: string[] }>(bTablet, "notification:read", 3000);

    const res = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: m1.seq });
    expect(res.body.data.changed).toBe(true);

    const enqueued = mockEnqueue.mock.calls.find((c) => c[1] === "notifications.mark-read-by-stream");
    expect(enqueued?.[2]).toEqual({ userId: b.id, scopeType: "CHANNEL", scopeId: channelId, streamKey: "root", seq: m1.seq });
    expect(enqueued?.[3].jobId).not.toMatch(/:/); // BullMQ cấm ":" trong jobId tuỳ biến
    await getProcessor("notifications", "notifications.mark-read-by-stream")({ data: enqueued?.[2] });

    expect((await readEvent).ids).toEqual([row1.id]);
    expect((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: row1.id } })).readAt).toBeInstanceOf(Date);
    expect((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: row2.id } })).readAt).toBeNull();
  });

  it("GET /me/unread/summary: hội thoại MUTED không tính vào unreadConversations; badgeTotal = hội thoại + hộp thư; cache bị xoá khi đọc", async () => {
    const { a, b, workspaceId, channelId } = await setup();
    const c1 = await createGroup(a.id, workspaceId, [b.id], "Nhóm 1");
    const c2 = await createGroup(a.id, workspaceId, [b.id], "Nhóm 2 (tắt tiếng)");
    await sendConversation(a.id, c1, "1a");
    const last1 = await sendConversation(a.id, c1, "1b");
    await sendConversation(a.id, c2, "2a");
    await prisma.conversationMember.updateMany({ where: { conversationId: c2, userId: b.id }, data: { notifyMode: "MUTED" } });
    const memberRows = await prisma.conversationMember.findMany({ where: { userId: b.id, conversationId: { in: [c1, c2] } } });
    const totalUnread = memberRows.reduce((acc, m) => acc + m.unreadCount, 0);
    await sendChannel(a.id, channelId, "tin kênh");
    await prisma.notification.create({
      data: { type: "mention", scopeType: "CHANNEL", scopeId: channelId, workspaceId, sourceType: "MESSAGE", sourceId: "x", dedupeKey: `msg:${randomUUID()}` },
    }).then((n) =>
      prisma.notificationRecipient.create({
        data: {
          notificationId: n.id, recipientId: b.id, kind: "MENTION", kindRank: 100, inInbox: true, dedupeKey: n.dedupeKey, scopeType: "CHANNEL", scopeId: channelId,
          workspaceId, streamKey: "root", streamSeq: 1, filterBucket: "mentions", readAt: null, seenAt: null, skipReason: null, deliveredPushAt: null, cancelledAt: null,
        },
      })
    );

    const res = await request(app).get("/api/v1/me/unread/summary").set("Authorization", auth(b.id));
    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toEqual({ unreadConversations: 1, unreadMessages: totalUnread, mentions: 0 }); // muted: chỉ c1 tính là hội thoại chưa đọc, nhưng unreadMessages gồm cả c2
    expect(res.body.data.activity).toEqual({ unread: 1, mentions: 1 });
    expect(res.body.data.badgeTotal).toBe(2);
    expect(res.body.data.workspaces).toContainEqual({ workspaceId, unreadChannels: 1, mentions: 1 });

    // Đọc hết c1 → cache summary bị xoá → lần đọc kế phản ánh ngay
    await mark(b.id, { streamType: "CONVERSATION", streamId: c1, lastReadSeq: last1.seq });
    const after = await request(app).get("/api/v1/me/unread/summary").set("Authorization", auth(b.id));
    expect(after.body.data.conversations.unreadConversations).toBe(0);
    expect(after.body.data.badgeTotal).toBe(1);
  });

  it("đổi tắt tiếng/lưu trữ/đánh dấu chưa đọc ở 1 máy → tổng hợp chưa đọc đổi NGAY (xoá cache) và máy kia nhận `unread:summary-changed`", async () => {
    const { a, b, workspaceId, channelId } = await setup();
    const c1 = await createGroup(a.id, workspaceId, [b.id], "Nhóm sẽ tắt tiếng");
    await sendConversation(a.id, c1, "tin 1");
    await sendChannel(a.id, channelId, "tin kênh");

    const summary = async () => (await request(app).get("/api/v1/me/unread/summary").set("Authorization", auth(b.id))).body.data;
    const before = await summary(); // ghi cache Redis (10 s)
    expect(before.conversations.unreadConversations).toBe(1);
    expect(before.workspaces).toContainEqual({ workspaceId, unreadChannels: 1, mentions: 0 });

    const bTablet = await connect(b.id, "tablet");
    const changed = waitForEvent<Record<string, unknown>>(bTablet, "unread:summary-changed", 2000);
    const muteConv = await request(app).patch(`/api/v1/conversations/${c1}/me`).set("Authorization", auth(b.id)).send({ notifyMode: "MUTED" });
    expect(muteConv.status).toBe(200);
    expect(await changed).toMatchObject({ v: 1, reason: "MUTE" });
    expect((await summary()).conversations.unreadConversations).toBe(0); // không đợi TTL cache

    // Bỏ tắt tiếng rồi đánh dấu chưa đọc thủ công → tính lại ngay (hội thoại đã có tin chưa đọc nên vẫn 1)
    await request(app).patch(`/api/v1/conversations/${c1}/me`).set("Authorization", auth(b.id)).send({ notifyMode: "INHERIT" });
    expect((await summary()).conversations.unreadConversations).toBe(1);
    // Lưu trữ → biến khỏi tổng hợp
    await request(app).patch(`/api/v1/conversations/${c1}/me`).set("Authorization", auth(b.id)).send({ archived: true });
    expect((await summary()).conversations.unreadConversations).toBe(0);

    // Kênh MUTED không tính vào unreadChannels
    const muteCh = await request(app).patch(`/api/v1/channels/${channelId}/me`).set("Authorization", auth(b.id)).send({ notifyMode: "MUTED" });
    expect(muteCh.status).toBe(200);
    expect((await summary()).workspaces).toContainEqual({ workspaceId, unreadChannels: 0, mentions: 0 });
  });

  it("GET /me/unread?workspaceId=: số chưa đọc theo kênh (chỉ tin của người khác), thread theo dõi; 404 khi không phải thành viên", async () => {
    const { a, b, workspaceId, channelId } = await setup();
    await sendChannel(a.id, channelId, "1");
    await sendChannel(a.id, channelId, "2");
    await sendChannel(b.id, channelId, "của chính B"); // không tính là chưa đọc của B
    await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 1 });

    const res = await request(app).get(`/api/v1/me/unread?workspaceId=${workspaceId}`).set("Authorization", auth(b.id));
    expect(res.status).toBe(200);
    expect(res.body.data.channels[channelId]).toMatchObject({ unread: 1, lastSeq: 3, capped: false, lastReadSeq: 1 });

    const outsider = await seedUser({ name: "Không thuộc nhóm" });
    userIds.push(outsider.id);
    const denied = await request(app).get(`/api/v1/me/unread?workspaceId=${workspaceId}`).set("Authorization", auth(outsider.id));
    expect(denied.status).toBe(404);
    const invalid = await request(app).get("/api/v1/me/unread").set("Authorization", auth(b.id));
    expect(invalid.status).toBe(400);
  });

  it("NT-13: đọc-tất-cả với `before` — hội thoại có tin mới SAU mốc vẫn chưa đọc; before tương lai xa → NOTI_003", async () => {
    const { a, b, workspaceId } = await setup();
    const c1 = await createGroup(a.id, workspaceId, [b.id], "Nhóm cũ");
    const c2 = await createGroup(a.id, workspaceId, [b.id], "Nhóm có tin mới");
    await sendConversation(a.id, c1, "cũ 1");
    await sendConversation(a.id, c2, "cũ 2");

    await new Promise((resolve) => setTimeout(resolve, 30));
    const before = new Date();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await sendConversation(a.id, c2, "mới sau khi bấm"); // activityAt(c2) > before

    const res = await request(app).post("/api/v1/me/read-all-conversations").set("Authorization", auth(b.id)).send({ before: before.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 1 });

    const m1 = await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: c1, userId: b.id } });
    const m2 = await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: c2, userId: b.id } });
    expect(m1).toMatchObject({ unreadCount: 0 });
    expect(m1.lastReadSeq).toBe((await prisma.conversation.findUniqueOrThrow({ where: { id: c1 } })).lastSeq);
    expect(m2.lastReadSeq).toBe(0);
    expect(m2.unreadCount).toBeGreaterThan(0); // tin "mới sau khi bấm" (và các tin trước) vẫn chưa đọc

    const future = await request(app).post("/api/v1/me/read-all-conversations").set("Authorization", auth(b.id)).send({ before: new Date(Date.now() + 3_600_000).toISOString() });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe("NOTI_003");
  });

  it("rate limit: scopeLimiter read-marker cho phép ≤ 120 lượt/phút/người (vượt → 429)", async () => {
    const { a, b, channelId } = await setup();
    await sendChannel(a.id, channelId, "x");
    const statuses: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      const r = await mark(b.id, { streamType: "CHANNEL", streamId: channelId, lastReadSeq: 1 });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(120).some((s) => s === 429)).toBe(true);
  }, 120_000);
});
