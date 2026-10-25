/**
 * MB-04 (be.md p1-02 §10/README §8) — 2 "thiết bị" (2 socket thật) của CÙNG
 * 1 user join `ws:{id}` → ADMIN loại người đó → CẢ HAI nhận `permission:revoked`
 * VÀ bị đá khỏi room ≤ 2s; emit tiếp vào `ws:{id}` sau đó không tới nữa.
 *
 * `ch:{id}` KHÔNG có trong bài test này — `channels` (p1-03) CHƯA implement
 * (chỉ có `channel-bootstrap.service.ts` tạo kênh "Chung", chưa đăng ký
 * `ScopeResolver` cho `CHANNEL` — xem `socket.guards.ts` fail-closed PERM_404
 * khi resolver chưa có), và `workspace-permission.resolver.ts` (p1-01) CHƯA
 * khai `children()` nên `revokeScope(WORKSPACE)` mới chỉ cascade tới room gốc
 * `ws:{id}` (đúng tiền lệ `core/permission/tests/integration/revoke-scope.test.ts`
 * — hạ tầng 2-socket-thật đầy đủ với cascade `ch:*`/`conv:*` để p1-03/p1-05
 * bổ sung `children()` sau). Dùng harness `socket.io-client` thật của p0-03
 * (`test-helpers.ts`) — KHÔNG cần dựng lại boilerplate riêng.
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
import { emitToScope } from "../../../../infrastructure/socket/socket.emit";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../members.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function httpTokenFor(userId: string, role = "user"): string {
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

describe("MB-04 — remove với 2 thiết bị cùng user trong ws:{id} (socket thật)", () => {
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
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
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

  it("MB-04: cả 2 thiết bị nhận permission:revoked + bị leave ws:{id} trong ≤ 2s, emit sau đó không tới nữa", async () => {
    const owner = await seedUser();
    const target = await seedUser();
    createdUserIds.push(owner.id, target.id);

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${httpTokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm MB-04" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, target.id, "MEMBER");

    const device1 = await connectClient(harness.port, {
      token: socketTokenFor(target.id, `${target.id}@e.com`),
      deviceId: "dev-1",
    });
    const device2 = await connectClient(harness.port, {
      token: socketTokenFor(target.id, `${target.id}@e.com`),
      deviceId: "dev-2",
    });

    const joinAck1 = await emitWithAck<{ ok: boolean }>(device1, "room:join", { kind: "ws", id: workspaceId });
    const joinAck2 = await emitWithAck<{ ok: boolean }>(device2, "room:join", { kind: "ws", id: workspaceId });
    expect(joinAck1).toEqual({ ok: true });
    expect(joinAck2).toEqual({ ok: true });

    const revoked1 = waitForEvent<Record<string, unknown>>(device1, "permission:revoked");
    const revoked2 = waitForEvent<Record<string, unknown>>(device2, "permission:revoked");

    const startedAt = Date.now();
    const removeRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members/${target.id}/remove`)
      .set("Authorization", `Bearer ${httpTokenFor(owner.id)}`)
      .send({ reason: "Vi phạm nội quy nhóm học tập" });
    expect(removeRes.status).toBe(200);

    const [payload1, payload2] = await Promise.all([revoked1, revoked2]);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThanOrEqual(2000);

    for (const payload of [payload1, payload2]) {
      expect(payload).toMatchObject({
        scopeType: "WORKSPACE",
        scopeId: workspaceId,
        reason: "REMOVED",
      });
    }

    // Đá khỏi room `ws:{id}` — không còn socket nào của target trong room đó.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const socketsStillInRoom = await harness.io.in(ROOM.workspace(workspaceId)).fetchSockets();
    expect(socketsStillInRoom).toHaveLength(0);

    // Emit tiếp vào ws:{id} SAU KHI đã bị đá → không tới nữa (đã leave room).
    let device1GotMore = false;
    let device2GotMore = false;
    device1.on("member:updated", () => {
      device1GotMore = true;
    });
    device2.on("member:updated", () => {
      device2GotMore = true;
    });
    await emitToScope({ type: "WORKSPACE", id: workspaceId }, "member:updated", {
      workspaceId,
      userId: target.id,
      role: "MEMBER",
      status: "REMOVED",
      displayName: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(device1GotMore).toBe(false);
    expect(device2GotMore).toBe(false);

    device1.disconnect();
    device2.disconnect();
  }, 15_000);
});
