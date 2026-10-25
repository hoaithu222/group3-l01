/**
 * Integration — CH-09 (README p1-03 §8, be.md p1-03 §10 "Socket"): `channel:activity` của
 * kênh PRIVATE KHÔNG tới người chỉ ở room `ws:{id}`; chỉ unicast `user:{id}` cho người có grant
 * (người được nhắc nhận `mentionMe:true`). Kênh PUBLIC broadcast `ws:{id}`. Socket.io-client thật;
 * outbox `message.created` được xử lý bằng cách gọi TAY processor `message.events` (relay/BullMQ thật
 * không chạy trong Jest — giống `messages-realtime.test.ts`).
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
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import messagesRoutes from "../../../messages/messages.routes";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import channelsRoutes from "../../channels.routes";
import { registerChannelModule } from "../../index";
// Side-effect: đăng ký processor `message.events` qua `registerJob` đã mock ở trên.
import "../../../messages/events/message.outbox-handlers";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();
jest.setTimeout(60_000);

const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

function getProcessor(jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === "notifications" && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho notifications/${jobName}`);
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

describe("channel:activity realtime — CH-09 (integration — socket.io thật)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
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
    if (channelIds.length > 0) await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
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

  async function connect(userId: string, deviceId: string): Promise<ClientSocket> {
    const client = await connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId });
    clients.push(client);
    // Chờ ngắn để server join xong `user:{id}` + `ws:{id}` sau connect (race đã ghi ở messages-realtime.test.ts).
    await new Promise((resolve) => setTimeout(resolve, 300));
    return client;
  }

  it("CH-09: kênh PRIVATE → channel:activity chỉ tới grantee (user:{id}), KHÔNG tới người chỉ ở ws:{id}; kênh PUBLIC → tới ws:{id}", async () => {
    const owner = await seedUser({ name: "Chủ kênh CH-09" });
    const grantee = await seedUser({ name: "Người có grant" });
    const watcher = await seedUser({ name: "Chỉ ở ws room" });
    userIds.push(owner.id, grantee.id, watcher.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(owner.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm CH-09" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, grantee.id, "MEMBER");
    await addMembership(workspaceId, watcher.id, "MEMBER");

    const privateChannel = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner.id))
      .send({ name: "Kênh riêng CH-09", visibility: "PRIVATE", initialMemberIds: [grantee.id] });
    expect(privateChannel.status).toBe(201);
    const privateId = privateChannel.body.data.id as string;
    const publicChannel = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner.id))
      .send({ name: "Kênh công khai CH-09", visibility: "PUBLIC" });
    expect(publicChannel.status).toBe(201);
    const publicId = publicChannel.body.data.id as string;

    const granteeSocket = await connect(grantee.id, "device-grantee");
    const watcherSocket = await connect(watcher.id, "device-watcher");

    const post = async (channelId: string, body: Record<string, unknown>) => {
      const res = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", auth(owner.id))
        .send({ clientMessageId: randomUUID(), ...body });
      expect(res.status).toBe(201);
      await getProcessor("message.events")({ data: { event: "created", messageId: res.body.data.id } } as Job);
      return res.body.data as { id: string };
    };

    // ── PRIVATE (có nhắc grantee): grantee nhận mentionMe:true, watcher (chỉ ở ws:{id}) KHÔNG nhận gì ──
    const granteeGets = waitForEvent<Record<string, unknown>>(granteeSocket, "channel:activity");
    const watcherNone = expectNoEvent(watcherSocket, "channel:activity");
    await post(privateChannel.body.data.id as string, {
      content: `Chào @{u:${grantee.id}}, tài liệu mật`,
      mentions: [{ type: "USER", targetId: grantee.id }],
    });
    const activity = await granteeGets;
    expect(activity).toMatchObject({ v: 1, channelId: privateId, workspaceId, lastSeq: 1, mentionMe: true });
    expect(JSON.stringify(activity)).not.toContain("tài liệu mật"); // không có preview nội dung
    await watcherNone;

    // ── PUBLIC: watcher (ở ws:{id}) nhận, mentionMe=false ──
    const watcherGets = waitForEvent<Record<string, unknown>>(watcherSocket, "channel:activity");
    await post(publicId, { content: "Thông báo công khai" });
    expect(await watcherGets).toMatchObject({ v: 1, channelId: publicId, workspaceId, lastSeq: 1, mentionMe: false });
  });
});
