/**
 * Integration — socket thật (be.md §6, README §8 TX-02/MSG-05) trên adapter
 * CHANNEL thật (Mongo memory replset + `socket.io-client` thật, giống
 * `channels-realtime.test.ts`).
 *
 * - TX-02: client A đã `room:join` vào `ch:{id}` nhận `message:created` SAU
 *   KHI HTTP POST của client B hoàn tất — payload KHÔNG có `myPermissions`/
 *   `reactions[].me` (be.md §6 "broadcast không có 1 viewer cụ thể").
 * - MSG-05: ẩn tin ở "thiết bị" A (1 socket) → "thiết bị" B (socket KHÁC,
 *   CÙNG userId) nhận `message:hidden` trên room `user:{id}` — `hide()` gọi
 *   `emitToUsers` TRỰC TIẾP trong request (không qua outbox), nên test này
 *   không cần mock `registerJob`.
 *
 * `message:created` đi qua outbox (`message.service.ts` chỉ `outbox.add()`
 * trong tx, KHÔNG emit trực tiếp — D-22) → relay/BullMQ thật không chạy
 * trong Jest (không có Redis/BullMQ thật) — mock `infrastructure/queue`
 * để LẤY LẠI processor `message.events` đã đăng ký qua `registerJob` (giống
 * `channel-membership-revoked.test.ts`) rồi gọi TAY sau khi HTTP POST commit,
 * thay vì chờ relay thật.
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

const redisStore = new Map<string, unknown>();
const redisHashStore = new Map<string, Record<string, string>>();
function redisGetImpl(key: string): Promise<unknown> {
  return Promise.resolve(redisStore.has(key) ? redisStore.get(key) : null);
}
function redisSetImpl(key: string, value: unknown): Promise<void> {
  redisStore.set(key, value);
  return Promise.resolve();
}
function redisDelImpl(key: string): Promise<void> {
  redisStore.delete(key);
  return Promise.resolve();
}
function redisGetdelImpl(key: string): Promise<unknown> {
  const v = redisStore.has(key) ? redisStore.get(key) : null;
  redisStore.delete(key);
  return Promise.resolve(v);
}
function redisIncrImpl(key: string): Promise<number> {
  const next = ((redisStore.get(key) as number) ?? 0) + 1;
  redisStore.set(key, next);
  return Promise.resolve(next);
}
function redisExistsImpl(key: string): Promise<boolean> {
  return Promise.resolve(redisStore.has(key));
}
function redisSetNxImpl(key: string): Promise<boolean> {
  if (redisStore.has(key)) return Promise.resolve(false);
  redisStore.set(key, "1");
  return Promise.resolve(true);
}
function redisHsetImpl(key: string, field: string, value: string): Promise<void> {
  const h = redisHashStore.get(key) ?? {};
  h[field] = value;
  redisHashStore.set(key, h);
  return Promise.resolve();
}
function redisHgetallImpl(key: string): Promise<Record<string, string>> {
  return Promise.resolve({ ...(redisHashStore.get(key) ?? {}) });
}
function redisHdelImpl(key: string, field: string): Promise<void> {
  const h = redisHashStore.get(key);
  if (h) delete h[field];
  return Promise.resolve();
}

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
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
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
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../messages.routes";
// Side-effect: đăng ký processor `message.events` qua `registerJob` đã bị
// mock ở trên (capture vào `mockRegistered`) — giống
// `channel-membership-revoked.test.ts`.
import "../../events/message.outbox-handlers";

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

function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

async function seedUser(name = "Nguyễn Văn A"): Promise<{ id: string; name: string }> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: "" } });
  return { id, name };
}

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

describe("messages realtime — TX-02 (message:created), MSG-05 (message:hidden đa thiết bị)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

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
      createIndexes: "MessageHide",
      indexes: [{ key: { userId: 1, messageId: 1 }, name: "MessageHide_userId_messageId_key", unique: true }],
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
    (redis.get as jest.Mock).mockImplementation(redisGetImpl);
    (redis.set as jest.Mock).mockImplementation(redisSetImpl);
    (redis.del as jest.Mock).mockImplementation(redisDelImpl);
    (redis.getdel as jest.Mock).mockImplementation(redisGetdelImpl);
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockImplementation(redisExistsImpl);
    (redis.setNx as jest.Mock).mockImplementation(redisSetNxImpl);
    (redis.hset as jest.Mock).mockImplementation(redisHsetImpl);
    (redis.hgetall as jest.Mock).mockImplementation(redisHgetallImpl);
    (redis.hdel as jest.Mock).mockImplementation(redisHdelImpl);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockEnqueue.mockClear();
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
        await prisma.messageHide.deleteMany({ where: { scopeId: { in: channelIds } } });
        await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
        await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Channel", aggregateId: { in: channelIds } } });
      }
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Message" } });
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    redisHashStore.clear();
    mockAuditRecord.mockClear();
  });

  it("TX-02: client A đã join ch:{id} nhận message:created sau khi HTTP POST của B hoàn tất, không có myPermissions/reactions.me", async () => {
    const owner = await seedUser("Chủ kênh");
    const viewer = await seedUser("Người xem");
    createdUserIds.push(owner.id, viewer.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm realtime TX-02" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: viewer.id, role: "MEMBER", status: "ACTIVE" } });

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh realtime TX-02", visibility: "PUBLIC" });
    const channelId = ch.body.data.id as string;

    const clientA = await connectClient(harness.port, { token: socketTokenFor(viewer.id, `${viewer.id}@e.com`), deviceId: "device-A" });
    // Client "connect" phát ngay khi bắt tay engine.io xong — KHÔNG đảm bảo
    // server đã chạy hết `io.on("connection", ...)` (còn `await joinRoom`
    // user-room/`presenceJoinRooms`/`registryAdd` TRƯỚC khi
    // `registerRoomHandlers()` gắn listener `room:join`, xem `socket.server.ts`)
    // — race THẬT, phát hiện qua test này (emit `room:join` ngay sau connect
    // đôi khi rơi vào lúc server CHƯA gắn listener → ack không bao giờ tới,
    // hang tới hết timeout). Cùng cách xử lý đã có ở `channels-realtime.test.ts`
    // (chờ ngắn cho state phía server ổn định) — không phải hack riêng của test này.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const joinAck = await emitWithAck<{ ok: boolean }>(clientA, "room:join", { kind: "ch", id: channelId });
    expect(joinAck).toEqual({ ok: true });

    const createdEvent = waitForEvent<Record<string, unknown>>(clientA, "message:created");

    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Broadcast realtime TX-02" });
    expect(sent.status).toBe(201);
    const messageId = sent.body.data.id as string;

    // Gọi TAY processor `message.events` — outbox relay/BullMQ thật không
    // chạy trong Jest (xem docstring đầu file).
    const processor = getProcessor("notifications", "message.events");
    await processor({ data: { event: "created", messageId } } as Job);

    const payload = await createdEvent;
    expect(payload).toMatchObject({ id: messageId, seq: 1, content: "Broadcast realtime TX-02", authorId: owner.id, clientMessageId: expect.any(String) });
    expect(payload).not.toHaveProperty("myPermissions");
    const reactions = payload.reactions as Array<Record<string, unknown>> | undefined;
    if (reactions) {
      for (const r of reactions) expect(r).not.toHaveProperty("me");
    }

    clientA.disconnect();
  }, 15_000);

  it("MSG-05: ẩn tin ở thiết bị A → thiết bị B (CÙNG userId, socket khác) nhận message:hidden trên user:{id}", async () => {
    const owner = await seedUser("Chủ kênh MSG-05");
    createdUserIds.push(owner.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm realtime MSG-05" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh realtime MSG-05", visibility: "PUBLIC" });
    const channelId = ch.body.data.id as string;

    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Tin sẽ ẩn 2 máy" });
    const messageId = sent.body.data.id as string;

    // 2 "thiết bị" (2 socket thật) của CÙNG 1 user — tự join room `user:{id}`
    // lúc connect (socket.server.ts), không cần room:join thủ công.
    const deviceA = await connectClient(harness.port, { token: socketTokenFor(owner.id, `${owner.id}@e.com`), deviceId: "device-A" });
    const deviceB = await connectClient(harness.port, { token: socketTokenFor(owner.id, `${owner.id}@e.com`), deviceId: "device-B" });

    const hiddenOnB = waitForEvent<Record<string, unknown>>(deviceB, "message:hidden");

    const hide = await request(app).post(`/api/v1/messages/${messageId}/hide`).set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(hide.status).toBe(200);

    const payload = await hiddenOnB;
    expect(payload).toMatchObject({ messageId, scopeType: "CHANNEL", scopeId: channelId, hidden: true });

    deviceA.disconnect();
    deviceB.disconnect();
  }, 15_000);
});
