/**
 * Integration — p1-07 fan-out + push (Mongo memory replset, `TEST_DB=memory`; Redis mock STATEFUL; queue/FCM giả):
 * NT-01 (mention + theo dõi thread → MỘT mục), NT-04 (MUTED/chặn/đang xem), NT-05 (mất quyền trước khi push → bỏ,
 * hộp thư không lộ ngữ cảnh), NT-08 (gộp 5 tin → 1 push ngay + 1 push "4 tin nhắn mới"), NT-10 (SENDER/FULL),
 * NT-14 (người đã chặn tác giả), NT-15 phía server (badge tính lúc gửi), NT-16 (nhóm 200 người ≤ 3 s, 1 job/người).
 * Dòng outbox `fanout.message` do `message.service.ts#send()` ghi được đọc lại và chạy TAY qua processor (relay/BullMQ
 * thật không chạy trong Jest — giống `channel-activity-realtime.test.ts`).
 */
process.env.FEATURE_FLAGS = "communication=true,push=true";
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

const mockSendMulticast = jest.fn();
jest.mock("../../../../infrastructure/push", () => {
  const actual = jest.requireActual("../../../../infrastructure/push");
  return { ...actual, getPushSender: () => ({ sendMulticast: (...args: unknown[]) => mockSendMulticast(...args) }) };
});

import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { newObjectId } from "../../../../core/utils/object-id";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes from "../../../messages/messages.routes";
import threadsRoutes from "../../../threads/threads.routes";
import mentionsRoutes from "../../../mentions/mentions.routes";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerThreadsModule } from "../../../threads";
import { registerMentionsModule } from "../../../mentions";
import { getBlockPort } from "../../../blocks/public";
import notificationsRoutes from "../../notifications.routes";
import readStateRoutes from "../../../read-state/read-state.routes";
import { registerReadStateModule } from "../../../read-state";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
// Side-effect: đăng ký processor qua `registerJob` đã mock ở trên.
import "../../jobs/fanout-message.job";
import "../../jobs/message-push.jobs";
import "../../jobs/push.jobs";
import "../../jobs/mark-read-by-stream.job";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", channelsRoutes);
app.use("/api/v1", conversationsRoutes);
app.use("/api/v1", messagesRoutes);
app.use("/api/v1", threadsRoutes);
app.use("/api/v1", mentionsRoutes);
app.use("/api/v1", notificationsRoutes);
app.use("/api/v1", readStateRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const store = makeRedisStore();
jest.setTimeout(120_000);
const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor ${queue}/${jobName}`);
  return call[2];
}

interface EnqueuedPush {
  jobName: string;
  data: Record<string, unknown>;
  jobId: string;
}

function pushJobs(): EnqueuedPush[] {
  return mockEnqueue.mock.calls
    .filter((c) => c[0] === "push")
    .map((c) => ({ jobName: c[1] as string, data: c[2] as Record<string, unknown>, jobId: (c[3] as { jobId: string }).jobId }));
}

describe("p1-07 fan-out + push tin nhắn (integration)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const conversationIds: string[] = [];
  const extraChannelScopeIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    registerThreadsModule();
    registerMentionsModule();
    registerReadStateModule();
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
    await prisma.$runCommandRaw({
      createIndexes: "NotificationRecipient",
      indexes: [{ key: { recipientId: 1, dedupeKey: 1 }, name: "NotificationRecipient_recipientId_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Notification",
      indexes: [{ key: { dedupeKey: 1 }, name: "Notification_dedupeKey_key", unique: true }],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (redis as unknown as { incrBy: jest.Mock }).incrBy.mockResolvedValue(1);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    mockEnqueue.mockClear();
    mockSendMulticast.mockReset().mockResolvedValue({ successCount: 1, invalidTokens: [] });
  });

  afterEach(async () => {
    const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
    const scopeIds = [...channelIds, ...conversationIds, ...extraChannelScopeIds];
    if (scopeIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: scopeIds } } });
      await prisma.thread.deleteMany({ where: { channelId: { in: channelIds } } });
      await prisma.threadSubscription.deleteMany({ where: { channelId: { in: channelIds } } });
    }
    await prisma.notificationRecipient.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { workspaceId: { in: workspaceIds } }] } });
    await prisma.notification.deleteMany({ where: { OR: [{ workspaceId: { in: workspaceIds } }, { scopeId: { in: scopeIds } }] } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
    await prisma.readState.deleteMany({ where: { userId: { in: userIds } } });
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
    extraChannelScopeIds.length = 0;
    store.clear();
  });

  async function newUser(name: string): Promise<{ id: string; name: string }> {
    const u = await seedUser({ name });
    userIds.push(u.id);
    return u;
  }

  async function newWorkspace(owner: { id: string }, members: { id: string }[]): Promise<string> {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", auth(owner.id)).set("Idempotency-Key", `idem-${randomUUID()}`).send({ name: `Nhóm ${randomUUID().slice(0, 6)}` });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const m of members) await addMembership(workspaceId, m.id, "MEMBER");
    return workspaceId;
  }

  async function newChannel(owner: { id: string }, workspaceId: string, name: string, visibility: "PUBLIC" | "PRIVATE" = "PUBLIC", initialMemberIds: string[] = []): Promise<string> {
    const ch = await request(app).post(`/api/v1/workspaces/${workspaceId}/channels`).set("Authorization", auth(owner.id)).send({ name, visibility, ...(initialMemberIds.length > 0 && { initialMemberIds }) });
    expect(ch.status).toBe(201);
    return ch.body.data.id as string;
  }

  async function newGroup(creator: { id: string }, workspaceId: string, memberIds: string[]): Promise<string> {
    const res = await request(app).post("/api/v1/conversations").set("Authorization", auth(creator.id)).set("Idempotency-Key", `idem-${randomUUID()}`).send({ workspaceId, title: "Nhóm đồ án", memberIds });
    expect(res.status).toBe(201);
    conversationIds.push(res.body.data.id as string);
    return res.body.data.id as string;
  }

  async function send(userId: string, scopeType: "CHANNEL" | "CONVERSATION", scopeId: string, content: string, extra: Record<string, unknown> = {}): Promise<{ id: string; seq: number }> {
    const res = await request(app).post(`/api/v1/scopes/${scopeType}/${scopeId}/messages`).set("Authorization", auth(userId)).send({ clientMessageId: randomUUID(), content, ...extra });
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, seq: res.body.data.seq as number };
  }

  /** Chạy job fan-out với đúng payload dòng outbox do `send()` ghi (relay thật không chạy trong Jest). */
  async function runFanout(messageId: string): Promise<void> {
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "fanout.message", aggregateId: messageId } });
    await getProcessor("notifications", "fanout.message")({ data: row.payload });
  }

  async function addToken(userId: string): Promise<string> {
    const token = `fcm-${userId}`;
    await prisma.deviceToken.create({
      data: { userId, deviceId: `dev-${userId}`, platform: "ANDROID", kind: "FCM", token, revokedAt: null, revokeReason: null, failureCount: 0 },
    });
    return token;
  }

  async function runPushSend(data: Record<string, unknown>): Promise<void> {
    await getProcessor("push", "push.send")({ data });
  }

  it("send() ghi dòng outbox riêng `fanout.message` (cùng transaction) kèm mention/isFirstReply/parentAuthorId", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "kenh-outbox");
    const root = await send(a.id, "CHANNEL", channelId, "gốc");
    const reply = await send(b.id, "CHANNEL", channelId, `trả lời @{u:${a.id}}`, { threadRootId: root.id, mentions: [{ type: "USER", targetId: a.id }] });

    const rows = await prisma.outboxEvent.findMany({ where: { jobName: "fanout.message", aggregateId: { in: [root.id, reply.id] } } });
    expect(rows).toHaveLength(2);
    const replyRow = rows.find((r) => r.aggregateId === reply.id)!;
    expect(replyRow.dedupeKey).toBe(`fanout.message:message:${reply.id}`);
    expect(replyRow.queue).toBe("notifications");
    expect(replyRow.payload).toMatchObject({ messageId: reply.id, mentionUserIds: [a.id], mentionAll: false, isFirstReply: true, parentAuthorId: a.id });
  });

  it("NT-01: 2 mention cùng người + người đó theo dõi thread → MỘT mục MENTION; job chạy lại không nhân đôi", async () => {
    const a = await newUser("A tác giả");
    const b = await newUser("B được nhắc");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "kenh-nt01");

    const root = await send(a.id, "CHANNEL", channelId, "gốc luồng");
    const bReply = await send(b.id, "CHANNEL", channelId, "B trả lời (B tự động theo dõi thread)", { threadRootId: root.id });
    const mention = await send(a.id, "CHANNEL", channelId, `Nhắc @{u:${b.id}} và lần nữa @{u:${b.id}}`, {
      threadRootId: root.id,
      mentions: [{ type: "USER", targetId: b.id }],
    });

    await runFanout(bReply.id);
    await runFanout(mention.id);
    await runFanout(mention.id); // job retry

    const rowsB = await prisma.notificationRecipient.findMany({ where: { recipientId: b.id, dedupeKey: `msg:${mention.id}` } });
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]).toMatchObject({ kind: "MENTION", kindRank: 100, filterBucket: "mentions", inInbox: true, readAt: null, scopeType: "CHANNEL", scopeId: channelId, streamKey: root.id, streamSeq: mention.seq });

    // Reply đầu tiên của B → tác giả tin gốc (A) nhận FIRST_REPLY
    const rowA = await prisma.notificationRecipient.findFirstOrThrow({ where: { recipientId: a.id, dedupeKey: `msg:${bReply.id}` } });
    expect(rowA).toMatchObject({ kind: "FIRST_REPLY", filterBucket: "following" });

    // Hộp thư của B qua API: 1 mục, ngữ cảnh kiểm quyền lúc đọc, excerpt thay marker bằng @tên
    const inbox = await request(app).get("/api/v1/notifications?filter=mentions").set("Authorization", auth(b.id));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ kind: "MENTION", messageId: mention.id, threadId: root.id, context: { available: true, scopeName: "kenh-nt01" } });
    expect(inbox.body.data[0].context.excerpt).toContain("@");
    expect(inbox.body.data[0].actor).toMatchObject({ userId: a.id, name: "A tác giả" });
    const following = await request(app).get("/api/v1/notifications?filter=following").set("Authorization", auth(a.id));
    expect(following.body.data).toHaveLength(1);
  });

  it("thread: push mang threadId + rootMessageId (= id tin gốc); marker THREAD (Thread.id hoặc id tin gốc) tự đọc mục hộp thư của luồng; đã đọc tới reply thì push bị bỏ (NT-02/NT-12)", async () => {
    const a = await newUser("A tác giả");
    const b = await newUser("B được nhắc");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "kenh-thread");
    await addToken(b.id);

    const root = await send(a.id, "CHANNEL", channelId, "gốc luồng");
    await send(b.id, "CHANNEL", channelId, "B trả lời", { threadRootId: root.id });
    const mention = await send(a.id, "CHANNEL", channelId, `@{u:${b.id}} xem giúp`, { threadRootId: root.id, mentions: [{ type: "USER", targetId: b.id }] });
    await runFanout(mention.id);

    // Mục hộp thư khoá theo id TIN GỐC (= Message.threadId), seq theo luồng thread.
    const row = await prisma.notificationRecipient.findFirstOrThrow({ where: { recipientId: b.id, dedupeKey: `msg:${mention.id}` } });
    expect(row).toMatchObject({ kind: "MENTION", streamKey: root.id, streamSeq: mention.seq });

    // Push: hợp đồng payload cho app (route /thread/[messageId] cần id tin gốc).
    const [job] = pushJobs();
    expect(job?.data).toMatchObject({ userId: b.id, reason: "MENTION", threadId: root.id, scopeKey: `CHANNEL:${channelId}:${root.id}` });
    await runPushSend(job!.data);
    expect(mockSendMulticast).toHaveBeenCalledTimes(1);
    const payload = (mockSendMulticast.mock.calls[0] as [string[], { type: string; targetUserId: string; scopeType: string; scopeId: string; androidChannel: string; data: Record<string, string> }])[1];
    expect(payload).toMatchObject({ type: "mention", targetUserId: b.id, scopeType: "CHANNEL", scopeId: channelId, androidChannel: "mentions" });
    expect(payload.data).toMatchObject({ messageId: mention.id, threadId: root.id, rootMessageId: root.id });

    // Marker THREAD bằng id TIN GỐC (client hay nhầm với Thread.id) → chuẩn hoá theo Thread.id, mục hộp thư tự đọc.
    const thread = await prisma.thread.findFirstOrThrow({ where: { parentMessageId: root.id } });
    const res = await request(app).post("/api/v1/read-markers").set("Authorization", auth(b.id)).send({ streamType: "THREAD", streamId: root.id, lastReadSeq: mention.seq });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ streamType: "THREAD", streamId: thread.id, changed: true });
    expect(await prisma.readState.count({ where: { userId: b.id, streamType: "THREAD", streamId: thread.id } })).toBe(1);
    const enqueued = mockEnqueue.mock.calls.find((c) => c[1] === "notifications.mark-read-by-stream");
    expect(enqueued?.[2]).toMatchObject({ userId: b.id, scopeType: "CHANNEL", scopeId: channelId, streamKey: root.id });
    await getProcessor("notifications", "notifications.mark-read-by-stream")({ data: enqueued?.[2] });
    expect((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: row.id } })).readAt).toBeInstanceOf(Date);

    // Đã đọc tới reply → push (job đã xếp hàng trước đó) bị bỏ với lý do "read".
    mockSendMulticast.mockClear();
    await runPushSend(job!.data);
    expect(mockSendMulticast).not.toHaveBeenCalled();
  });

  it("kênh mặc định MENTIONS_AND_THREADS: tin thường KHÔNG push; nhắc tên → đúng 1 push job cho người được nhắc", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const c = await newUser("C");
    const workspaceId = await newWorkspace(a, [b, c]);
    const channelId = await newChannel(a, workspaceId, "kenh-mode");
    await addToken(b.id);
    await addToken(c.id);

    const plain = await send(a.id, "CHANNEL", channelId, "tin thường");
    await runFanout(plain.id);
    expect(pushJobs()).toHaveLength(0);
    expect(await prisma.notificationRecipient.count({ where: { workspaceId } })).toBe(0);

    const tag = await send(a.id, "CHANNEL", channelId, `@{u:${b.id}} xem giúp`, { mentions: [{ type: "USER", targetId: b.id }] });
    await runFanout(tag.id);
    const jobs = pushJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobName).toBe("push.send");
    expect(jobs[0]?.data).toMatchObject({ kind: "message", userId: b.id, messageId: tag.id, reason: "MENTION", scopeKey: `CHANNEL:${channelId}` });
    expect(jobs[0]?.jobId).not.toMatch(/:/);
  });

  it("NT-04/NT-09/NT-14: nhóm chat — MUTED, đã chặn tác giả, đang xem đều KHÔNG push; chỉ người còn lại nhận", async () => {
    const a = await newUser("A");
    const [b, c, d, e] = [await newUser("B muted"), await newUser("C blocker"), await newUser("D bình thường"), await newUser("E đang xem")];
    const workspaceId = await newWorkspace(a, [b, c, d, e]);
    const convId = await newGroup(a, workspaceId, [b.id, c.id, d.id, e.id]);
    for (const u of [b, c, d, e]) await addToken(u.id);

    await prisma.conversationMember.updateMany({ where: { conversationId: convId, userId: b.id }, data: { notifyMode: "MUTED" } });
    await prisma.userBlock.create({ data: { blockerId: c.id, blockedId: a.id } });
    await getBlockPort().invalidate([a.id, c.id]); // block được seed thẳng DB (không qua API) → xoá cache `blockedBy:*`
    store.redisStore.set(`viewing:${e.id}:CONVERSATION:${convId}`, "1");

    const m = await send(a.id, "CONVERSATION", convId, "Chiều nay họp lúc 3h");
    await runFanout(m.id);

    const jobs = pushJobs();
    expect(jobs.map((j) => j.data.userId)).toEqual([d.id]);
    expect(jobs[0]?.data).toMatchObject({ kind: "message", reason: "MESSAGE", scopeKey: `CONVERSATION:${convId}` });
  });

  it("NT-04 + NT-14: người MUTED được tag vẫn có mục hộp thư (nhãn 'đã tắt tiếng'); người đã chặn tác giả KHÔNG có mục", async () => {
    const a = await newUser("A");
    const [b, c] = [await newUser("B muted"), await newUser("C blocker")];
    const workspaceId = await newWorkspace(a, [b, c]);
    const convId = await newGroup(a, workspaceId, [b.id, c.id]);
    await addToken(b.id);
    await prisma.conversationMember.updateMany({ where: { conversationId: convId, userId: b.id }, data: { notifyMode: "MUTED" } });
    await prisma.userBlock.create({ data: { blockerId: c.id, blockedId: a.id } });
    await getBlockPort().invalidate([a.id, c.id]); // block được seed thẳng DB (không qua API) → xoá cache `blockedBy:*`

    const m = await send(a.id, "CONVERSATION", convId, `@{u:${b.id}} @{u:${c.id}} xem giúp`, {
      mentions: [{ type: "USER", targetId: b.id }, { type: "USER", targetId: c.id }],
    });
    await runFanout(m.id);

    expect(pushJobs()).toHaveLength(0);
    const rowB = await prisma.notificationRecipient.findFirstOrThrow({ where: { recipientId: b.id, dedupeKey: `msg:${m.id}` } });
    expect(rowB).toMatchObject({ kind: "MENTION", pushStatus: "SKIPPED", skipReason: "MUTED" });
    expect(await prisma.notificationRecipient.count({ where: { recipientId: c.id, dedupeKey: `msg:${m.id}` } })).toBe(0);
    // p1-08: người đã chặn tác giả không được đếm nhắc tên ở ConversationMember (onMessageCommitted lọc qua BlockPort)
    expect((await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: convId, userId: c.id } })).mentionsSinceRead).toBe(0);
    expect((await prisma.conversationMember.findFirstOrThrow({ where: { conversationId: convId, userId: b.id } })).mentionsSinceRead).toBe(1);

    const inbox = await request(app).get("/api/v1/notifications").set("Authorization", auth(b.id));
    expect(inbox.body.data[0]).toMatchObject({ kind: "MENTION", muted: true, context: { available: true, muted: true } });
  });

  it("push.send: payload HIDDEN mặc định + badge tính lúc gửi (NT-15 phía server) + đánh dấu đã push", async () => {
    const a = await newUser("A gửi");
    const d = await newUser("D nhận");
    const workspaceId = await newWorkspace(a, [d]);
    const convId = await newGroup(a, workspaceId, [d.id]);
    const token = await addToken(d.id);

    const m = await send(a.id, "CONVERSATION", convId, "Nội dung riêng tư không được lộ");
    await runFanout(m.id);
    const [job] = pushJobs();
    expect(job).toBeDefined();
    await runPushSend(job!.data);

    expect(mockSendMulticast).toHaveBeenCalledTimes(1);
    const [tokens, payload] = mockSendMulticast.mock.calls[0] as [string[], Record<string, unknown>];
    expect(tokens).toEqual([token]);
    expect(payload).toMatchObject({
      type: "message.new", targetUserId: d.id, scopeType: "CONVERSATION", scopeId: convId, title: "Super App", body: "Bạn có tin nhắn mới",
      badge: 1, groupKey: `CONVERSATION:${convId}`, androidChannel: "default",
    });
    expect(payload["data"]).toMatchObject({ messageId: m.id, v: "1" });
    expect(JSON.stringify(payload)).not.toContain("riêng tư");
    expect(store.redisStore.has(`push:sent:${m.id}:${d.id}`)).toBe(true);
  });

  it("NT-10: lockScreenPreview SENDER / FULL theo cài đặt tài khoản; nhóm hiển thị 'Tên: nội dung'", async () => {
    const a = await newUser("Minh");
    const d = await newUser("D nhận");
    const workspaceId = await newWorkspace(a, [d]);
    const convId = await newGroup(a, workspaceId, [d.id]);
    await addToken(d.id);

    // SENDER
    const put1 = await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(d.id)).send({ lockScreenPreview: "SENDER" });
    expect(put1.status).toBe(200);
    const m1 = await send(a.id, "CONVERSATION", convId, "Bí mật 1");
    await runFanout(m1.id);
    await runPushSend(pushJobs()[0]!.data);
    let payload = mockSendMulticast.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "Nhóm đồ án", body: "Minh: đã gửi tin nhắn" });
    expect(JSON.stringify(payload)).not.toContain("Bí mật");

    // FULL
    mockEnqueue.mockClear();
    mockSendMulticast.mockClear();
    store.redisStore.clear();
    await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(d.id)).send({ lockScreenPreview: "FULL" });
    const m2 = await send(a.id, "CONVERSATION", convId, "Họp lúc 3h chiều nay");
    await runFanout(m2.id);
    await runPushSend(pushJobs()[0]!.data);
    payload = mockSendMulticast.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "Nhóm đồ án", body: "Minh: Họp lúc 3h chiều nay" });
  });

  it("NT-10: kênh RIÊNG TƯ với FULL → chỉ tên người gửi, không lộ nội dung", async () => {
    const a = await newUser("Minh");
    const b = await newUser("B");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "ban-giam-doc", "PRIVATE", [b.id]);
    await addToken(b.id);
    await request(app).put("/api/v1/me/notification-preferences").set("Authorization", auth(b.id)).send({ lockScreenPreview: "FULL", channelMode: "ALL" });

    const m = await send(a.id, "CHANNEL", channelId, "Số liệu doanh thu tuyệt mật");
    await runFanout(m.id);
    await runPushSend(pushJobs()[0]!.data);
    const payload = mockSendMulticast.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "#ban-giam-doc", body: "Minh: đã gửi tin nhắn" });
    expect(JSON.stringify(payload)).not.toContain("tuyệt mật");
  });

  it("NT-05: mất quyền trước khi push chạy → bỏ, không gửi FCM, mục hộp thư biến mất (không lộ ngữ cảnh)", async () => {
    const a = await newUser("A");
    const b = await newUser("B bị gỡ");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "kenh-nt05");
    await addToken(b.id);

    const tag = await send(a.id, "CHANNEL", channelId, `@{u:${b.id}} khẩn`, { mentions: [{ type: "USER", targetId: b.id }] });
    await runFanout(tag.id);
    const [job] = pushJobs();
    expect(job?.data.userId).toBe(b.id);
    const inboxBefore = await request(app).get("/api/v1/notifications").set("Authorization", auth(b.id));
    expect(inboxBefore.body.data).toHaveLength(1);

    // B bị gỡ khỏi workspace TRƯỚC khi job push chạy
    await prisma.workspaceMembership.updateMany({ where: { workspaceId, userId: b.id }, data: { status: "REMOVED" } });
    store.redisStore.clear(); // cache quyền

    await runPushSend(job!.data);
    expect(mockSendMulticast).not.toHaveBeenCalled();
    const row = await prisma.notificationRecipient.findFirstOrThrow({ where: { recipientId: b.id, dedupeKey: `msg:${tag.id}` } });
    expect(row.inInbox).toBe(false);
    expect(row.cancelledAt).toBeInstanceOf(Date);

    const inboxAfter = await request(app).get("/api/v1/notifications").set("Authorization", auth(b.id));
    expect(inboxAfter.body.data).toHaveLength(0);
  });

  it("NT-05: quyền mất NHƯNG chưa kịp huỷ → GET /notifications trả context.available=false, không lộ excerpt/tên kênh", async () => {
    const a = await newUser("A");
    const b = await newUser("B bị gỡ");
    const workspaceId = await newWorkspace(a, [b]);
    const channelId = await newChannel(a, workspaceId, "kenh-bi-mat");
    const tag = await send(a.id, "CHANNEL", channelId, `@{u:${b.id}} tài liệu mật`, { mentions: [{ type: "USER", targetId: b.id }] });
    await runFanout(tag.id);

    await prisma.workspaceMembership.updateMany({ where: { workspaceId, userId: b.id }, data: { status: "REMOVED" } });
    store.redisStore.clear();

    const inbox = await request(app).get("/api/v1/notifications").set("Authorization", auth(b.id));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ unavailable: true, scopeId: null, actorId: null, context: { available: false } });
    expect(JSON.stringify(inbox.body.data[0])).not.toContain("tài liệu mật");
    expect(JSON.stringify(inbox.body.data[0])).not.toContain("kenh-bi-mat");
  });

  it("NT-08: A gửi B 5 tin liên tiếp → 1 push NGAY (tin đầu) + 1 job gộp → 1 push '4 tin nhắn mới'", async () => {
    (redis.getClient as jest.Mock).mockReturnValue({ isOpen: true, isReady: true }); // bật nhánh cửa sổ gộp (Redis "mở")
    const a = await newUser("A");
    const b = await newUser("B");
    const workspaceId = await newWorkspace(a, [b]);
    const convId = await newGroup(a, workspaceId, [b.id]);
    await addToken(b.id);

    const messages: { id: string; seq: number }[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const m = await send(a.id, "CONVERSATION", convId, `tin ${i}`);
      messages.push(m);
      await runFanout(m.id);
    }

    const jobs = pushJobs();
    const now = jobs.filter((j) => j.jobName === "push.send");
    const coalesced = jobs.filter((j) => j.jobName === "push.send-coalesced");
    expect(now).toHaveLength(1);
    expect(now[0]?.data.messageId).toBe(messages[0]?.id);
    expect(new Set(coalesced.map((j) => j.jobId)).size).toBe(1);

    await runPushSend(now[0]!.data);
    await getProcessor("push", "push.send-coalesced")({ data: coalesced[0]!.data });

    expect(mockSendMulticast).toHaveBeenCalledTimes(2);
    const second = mockSendMulticast.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(second).toMatchObject({ body: "4 tin nhắn mới", data: expect.objectContaining({ count: "4", messageId: messages[4]?.id }) });
  });

  it("push.send-coalesced: người nhận đã đọc hết trong lúc chờ → không gửi", async () => {
    (redis.getClient as jest.Mock).mockReturnValue({ isOpen: true, isReady: true });
    const a = await newUser("A");
    const b = await newUser("B");
    const workspaceId = await newWorkspace(a, [b]);
    const convId = await newGroup(a, workspaceId, [b.id]);
    await addToken(b.id);

    const ms: { id: string; seq: number }[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const m = await send(a.id, "CONVERSATION", convId, `tin ${i}`);
      ms.push(m);
      await runFanout(m.id);
    }
    const coalesced = pushJobs().find((j) => j.jobName === "push.send-coalesced")!;
    await prisma.conversationMember.updateMany({ where: { conversationId: convId, userId: b.id }, data: { lastReadSeq: ms[2]!.seq, unreadCount: 0 } });
    await getProcessor("push", "push.send-coalesced")({ data: coalesced.data });
    expect(mockSendMulticast).not.toHaveBeenCalled();
  });

  it("NT-16 (smoke): nhóm 200 người, 1 tin → fan-out ≤ 3 s, đúng 1 push job/người (trừ tác giả), không trùng", async () => {
    const a = await newUser("Tác giả nhóm lớn");
    const workspaceId = await newWorkspace(a, []);
    const convId = newObjectId();
    conversationIds.push(convId);
    const memberIds = Array.from({ length: 199 }, () => newObjectId());
    await prisma.conversation.create({
      data: {
        id: convId, kind: "GROUP", workspaceId, directKey: `g:${convId}`, meetingKey: `none:${convId}`, title: "Nhóm 200", createdBy: a.id, ownerId: a.id,
        status: "ACTIVE", settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" }, lastSeq: 1, memberCount: 200,
      },
    });
    await prisma.conversationMember.createMany({
      data: [a.id, ...memberIds].map((userId) => ({
        conversationId: convId, userId, kind: "GROUP" as const, workspaceId, role: "MEMBER" as const, status: "ACTIVE" as const, notifyMode: "INHERIT" as const,
        archivedAt: null, mutedUntil: null, pinnedAt: null, leftAt: null,
      })),
    });
    const msg = await prisma.message.create({
      data: {
        scopeType: "CONVERSATION", scopeId: convId, workspaceId, threadKey: "root", seq: 1, authorId: a.id, kind: "USER", dedupeKey: `u:${a.id}:${randomUUID()}`,
        content: "Thông báo cả nhóm", normalizedContent: "thong bao ca nhom", deletedAt: null, pinnedAt: null, editedAt: null,
      },
    });

    const t0 = Date.now();
    await getProcessor("notifications", "fanout.message")({ data: { messageId: msg.id, mentionUserIds: [], mentionAll: false } });
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(3000);
    const jobs = pushJobs().filter((j) => j.jobName === "push.send");
    expect(jobs).toHaveLength(199);
    expect(new Set(jobs.map((j) => j.data.userId)).size).toBe(199);
    expect(jobs.some((j) => j.data.userId === a.id)).toBe(false);
    expect(new Set(jobs.map((j) => j.jobId)).size).toBe(199);
  });
});
