/**
 * PR-03 (be.md README §8 / p1-03 be.md §6, §10) — 2 "thiết bị" (2 socket thật)
 * của CÙNG 1 user tham gia `ch:{id}` của kênh riêng tư → MANAGER thu hồi
 * grant của user đó → CẢ HAI nhận `channel:revoked` VÀ bị đá khỏi `ch:{id}`
 * ≤ 2 s; emit tiếp vào `ch:{id}` sau đó không tới nữa (retry bị chặn).
 * Mirror cấu trúc `members-realtime.test.ts` (MB-04) — dùng harness
 * `socket.io-client` thật của p0-03 (`test-helpers.ts`).
 *
 * CH-09 (`channel:activity` không tới `ws:{id}` cho kênh private) phụ thuộc
 * `MessageScopeAdapter` CHANNEL (be.md §5.6, chưa implement — chờ p1-04, xem
 * đầu `channels.routes.test.ts`) — KHÔNG có gì để phát/kiểm ở đây, bỏ qua có
 * chủ đích (không fabricate 1 đường commit tin giả).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import express from "express";
import request from "supertest";
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { ROOM } from "../../../../infrastructure/socket";
import { emitToRoom } from "../../../../infrastructure/socket/socket.emit";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../channels.routes";
import channelGrantsRoutes from "../../channel-grants.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

async function seedUser(overrides: { id?: string; name?: string } = {}): Promise<{ id: string; name: string }> {
  const id = overrides.id ?? newObjectId();
  const name = overrides.name ?? "Nguyễn Văn A";
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name } });
  return { id, name };
}

async function addMembership(workspaceId: string, userId: string, role: "OWNER" | "ADMIN" | "MEMBER"): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
}

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

describe("PR-03 — thu hồi grant kênh private với 2 thiết bị trong ch:{id} (socket thật)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
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
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
        await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Channel", aggregateId: { in: channelIds } } });
      }
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
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
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    redisHashStore.clear();
    mockAuditRecord.mockClear();
  });

  it("PR-03: cả 2 thiết bị nhận channel:revoked + bị leave ch:{id} trong ≤ 2s, emit sau đó không tới nữa", async () => {
    const owner = await seedUser();
    const target = await seedUser();
    createdUserIds.push(owner.id, target.id);

    const wsCreated = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm PR-03" });
    expect(wsCreated.status).toBe(201);
    const workspaceId = wsCreated.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, target.id, "MEMBER");

    const channelCreated = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Riêng tư PR-03", visibility: "PRIVATE", initialMemberIds: [target.id] });
    expect(channelCreated.status).toBe(201);
    const channelId = channelCreated.body.data.id as string;

    const device1 = await connectClient(harness.port, {
      token: socketTokenFor(target.id, `${target.id}@e.com`),
      deviceId: "dev-1",
    });
    const device2 = await connectClient(harness.port, {
      token: socketTokenFor(target.id, `${target.id}@e.com`),
      deviceId: "dev-2",
    });

    const joinAck1 = await emitWithAck<{ ok: boolean }>(device1, "room:join", { kind: "ch", id: channelId });
    const joinAck2 = await emitWithAck<{ ok: boolean }>(device2, "room:join", { kind: "ch", id: channelId });
    expect(joinAck1).toEqual({ ok: true });
    expect(joinAck2).toEqual({ ok: true });

    const revoked1 = waitForEvent<Record<string, unknown>>(device1, "channel:revoked");
    const revoked2 = waitForEvent<Record<string, unknown>>(device2, "channel:revoked");

    const startedAt = Date.now();
    const revokeRes = await request(app)
      .delete(`/api/v1/channels/${channelId}/grants/${target.id}`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(revokeRes.status).toBe(200);

    const [payload1, payload2] = await Promise.all([revoked1, revoked2]);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThanOrEqual(2000);

    for (const payload of [payload1, payload2]) {
      expect(payload).toMatchObject({ channelId, workspaceId });
    }

    // Đá khỏi room `ch:{id}` — không còn socket nào của target trong room đó.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const socketsStillInRoom = await harness.io.in(ROOM.channel(channelId)).fetchSockets();
    expect(socketsStillInRoom).toHaveLength(0);

    // Grant/membership DIRECT của target đã bị xoá thật trong DB.
    const grant = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: target.id, source: "DIRECT" } },
    });
    expect(grant).toBeNull();

    // Emit tiếp vào ch:{id} SAU KHI đã bị đá → không tới nữa (đã leave room, retry bị chặn).
    let device1GotMore = false;
    let device2GotMore = false;
    device1.on("channel:updated", () => {
      device1GotMore = true;
    });
    device2.on("channel:updated", () => {
      device2GotMore = true;
    });
    emitToRoom(ROOM.channel(channelId), "channel:updated", { id: channelId, name: "Không nên tới" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(device1GotMore).toBe(false);
    expect(device2GotMore).toBe(false);

    device1.disconnect();
    device2.disconnect();
  }, 15_000);
});
