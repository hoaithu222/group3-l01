/**
 * Integration — socket thật (be.md p1-06 §6/§10 "Socket"):
 *   - `thread:updated` (room `ch:{channelId}`) tới người đang mở kênh sau khi outbox
 *     `message.created` có `threadId` được xử lý (processor `message.events` bắt qua
 *     `registerJob` đã mock — relay/BullMQ thật không chạy trong Jest, giống
 *     `messages-realtime.test.ts`), KHÔNG lộ nội dung reply.
 *   - `thread:subscription-updated` (room `user:{id}`) tới THIẾT BỊ THỨ HAI cùng tài khoản
 *     khi PUT subscription (đồng bộ đa thiết bị) và KHÔNG tới người khác.
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
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
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
import type { Job } from "bullmq";
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import messagesRoutes from "../../../messages/messages.routes";
import { registerChannelModule } from "../../../channels";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import threadsRoutes from "../../threads.routes";
import { registerThreadsModule } from "../../index";
// Side-effect: đăng ký processor `message.events` qua `registerJob` đã mock ở trên.
import "../../../messages/events/message.outbox-handlers";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1", threadsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();
jest.setTimeout(60_000);

const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

function waitForEvent<T>(client: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Hết ${timeoutMs}ms chờ sự kiện ${event}`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Xác nhận `event` KHÔNG tới `client` trong `ms` — dùng để kiểm cô lập (người khác không nhận). */
function expectNoEvent(client: ClientSocket, event: string, ms = 600): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`Không được nhận sự kiện ${event}`));
    client.once(event, handler);
    setTimeout(() => {
      client.off(event, handler);
      resolve();
    }, ms);
  });
}

describe("threads realtime — thread:updated, thread:subscription-updated (integration — socket.io thật)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerThreadsModule();
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
    for (const c of clients.splice(0)) c.disconnect();
    const channelIds = (
      await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })
    ).map((c) => c.id);
    if (channelIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
      await prisma.threadSubscription.deleteMany({ where: { channelId: { in: channelIds } } });
      await prisma.thread.deleteMany({ where: { channelId: { in: channelIds } } });
    }
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Message", "Channel"] } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: workspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) } });
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

  async function setup() {
    const owner = await seedUser({ name: "Chủ kênh realtime" });
    const replier = await seedUser({ name: "Người trả lời" });
    const watcher = await seedUser({ name: "Người đang mở kênh" });
    userIds.push(owner.id, replier.id, watcher.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(owner.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm thread realtime" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, replier.id, "MEMBER");
    await addMembership(workspaceId, watcher.id, "MEMBER");
    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner.id))
      .send({ name: "Kênh thread realtime", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    const channelId = ch.body.data.id as string;
    const root = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(owner.id))
      .send({ clientMessageId: randomUUID(), content: "Tin gốc realtime" });
    expect(root.status).toBe(201);
    return { owner, replier, watcher, channelId, rootId: root.body.data.id as string };
  }

  async function connect(userId: string, deviceId: string): Promise<ClientSocket> {
    const client = await connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId });
    clients.push(client);
    // Chờ ngắn để server gắn xong listener `room:join` sau connect (race đã ghi ở messages-realtime.test.ts).
    await new Promise((resolve) => setTimeout(resolve, 200));
    return client;
  }

  it("thread:updated: người đang mở kênh (đã join ch:{id}) nhận tóm tắt thread mới sau khi outbox reply được xử lý — không có nội dung reply", async () => {
    const { replier, watcher, channelId, rootId } = await setup();
    const watcherSocket = await connect(watcher.id, "device-watcher");
    expect(await emitWithAck<{ ok: boolean }>(watcherSocket, "room:join", { kind: "ch", id: channelId })).toEqual({ ok: true });

    const updated = waitForEvent<Record<string, unknown>>(watcherSocket, "thread:updated");
    const reply = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(replier.id))
      .send({ clientMessageId: randomUUID(), content: "Nội dung reply bí mật", threadRootId: rootId });
    expect(reply.status).toBe(201);

    // Outbox → processor `message.events` (gọi TAY sau khi HTTP commit).
    await getProcessor("notifications", "message.events")({ data: { event: "created", messageId: reply.body.data.id } } as Job);

    const payload = await updated;
    const thread = await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: rootId } });
    expect(payload).toMatchObject({
      v: 1,
      threadId: thread.id,
      parentMessageId: rootId,
      replyCount: 1,
      lastReplySeq: 1,
      lastReplierIds: [replier.id],
    });
    expect(payload).toHaveProperty("lastReplyAt");
    expect(JSON.stringify(payload)).not.toContain("Nội dung reply bí mật");
  });

  it("thread:updated KHÔNG tới người chưa join ch:{id} (không phải người đang mở kênh)", async () => {
    const { replier, watcher, channelId, rootId } = await setup();
    const bystander = await connect(watcher.id, "device-bystander"); // kết nối nhưng KHÔNG room:join kênh

    const reply = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(replier.id))
      .send({ clientMessageId: randomUUID(), content: "Reply", threadRootId: rootId });
    expect(reply.status).toBe(201);

    const none = expectNoEvent(bystander, "thread:updated");
    await getProcessor("notifications", "message.events")({ data: { event: "created", messageId: reply.body.data.id } } as Job);
    await none;
  });

  it("thread:subscription-updated: PUT subscription ở máy 1 → máy 2 CÙNG tài khoản nhận {threadId,state}; người khác không nhận", async () => {
    const { replier, watcher, channelId, rootId } = await setup();
    const reply = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(replier.id))
      .send({ clientMessageId: randomUUID(), content: "Reply", threadRootId: rootId });
    expect(reply.status).toBe(201);
    const thread = await prisma.thread.findUniqueOrThrow({ where: { parentMessageId: rootId } });

    const device1 = await connect(replier.id, "device-1");
    const device2 = await connect(replier.id, "device-2");
    const other = await connect(watcher.id, "device-other");

    const onDevice2 = waitForEvent<Record<string, unknown>>(device2, "thread:subscription-updated");
    const noneForOther = expectNoEvent(other, "thread:subscription-updated");
    const put = await request(app)
      .put(`/api/v1/threads/${thread.id}/subscription`)
      .set("Authorization", auth(replier.id))
      .send({ state: "EXPLICIT_OFF" });
    expect(put.status).toBe(200);

    expect(await onDevice2).toMatchObject({ v: 1, threadId: thread.id, state: "EXPLICIT_OFF" });
    await noneForOther;
    expect(device1.connected).toBe(true);
  });
});
