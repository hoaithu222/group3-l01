/**
 * Integration — `ChannelGrantPort` (p3-04, `shared/ports/channel-grant.port.ts`): cổng để `workspaces`/`members` (be-p3-04b: khách,
 * lời mời email) cấp/thu hồi grant kênh DIRECT trong transaction của họ. Mongo memory replset + Socket.IO thật (`TEST_DB=memory`).
 *   - `grantMemberInTx`: kênh public + riêng tư, bỏ qua kênh đã lưu trữ / ngoài workspace / không tồn tại, idempotent, `memberCount`,
 *     outbox `channel.grant-added` (via DIRECT) → `channel:granted`; khoá unique `[channelId, subjectKey, source]` thật.
 *   - `afterCommit`: vào room `ch:` (granted); `revokeMemberInTx` + `afterCommit` → `channel:revoked` + rời room + 404.
 *   - `revokeAllInTx` (hết hạn khách): outbox `channel.membership-revoked` → consumer p1-03 dọn grant/membership/memberCount.
 *   - giữ quyền khi vẫn được phủ bởi role grant; `syncRoleAccessInTx` cho người mới vào nhóm.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});
jest.setTimeout(60_000);

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockEnqueue = jest.fn();
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
  };
});

const redisStore = new Map<string, unknown>();
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
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn(),
}));
const mockAuditRecord = jest.fn();
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import express from "express";
import request from "supertest";
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma, withTransaction } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { ROOM } from "../../../../infrastructure/socket";
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
import { createChannelGrantPort } from "../../index";
import "../../jobs/membership-revoked.consumer";
import "../../jobs/channel-events.consumer";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", channelsRoutes);
app.use("/api/v1/channels", channelGrantsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const tokenFor = (userId: string): string =>
  JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });
const auth = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
const processor = (jobName: string): Processor => {
  const call = mockRegistered.find((c) => c[1] === jobName);
  if (!call) throw new Error(`Chưa đăng ký processor ${jobName}`);
  return call[2];
};

describe("ChannelGrantPort (integration)", () => {
  const port = createChannelGrantPort();
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    await prisma.$runCommandRaw({
      createIndexes: "ChannelGrant",
      indexes: [{ key: { channelId: 1, subjectKey: 1, source: 1 }, name: "ChannelGrant_channelId_subjectKey_source_key", unique: true }],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    redisStore.clear();
    mockEnqueue.mockReset().mockResolvedValue(undefined);
    (redis.get as jest.Mock).mockImplementation(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null));
    (redis.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => {
      redisStore.set(k, v);
    });
    (redis.del as jest.Mock).mockImplementation(async (k: string) => {
      redisStore.delete(k);
    });
    (redis.incr as jest.Mock).mockImplementation(async (k: string) => {
      const next = ((redisStore.get(k) as number) ?? 0) + 1;
      redisStore.set(k, next);
      return next;
    });
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockImplementation(async (k: string) => redisStore.has(k));
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    (redis.setNx as jest.Mock).mockResolvedValue(true);
    (redis.hset as jest.Mock).mockResolvedValue(undefined);
    (redis.hgetall as jest.Mock).mockResolvedValue({});
    (redis.hdel as jest.Mock).mockResolvedValue(undefined);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });

  afterEach(async () => {
    if (workspaceIds.length > 0) {
      const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
      await prisma.outboxEvent.deleteMany({
        where: { OR: [{ aggregateType: "Channel", aggregateId: { in: channelIds } }, ...workspaceIds.map((id) => ({ aggregateId: { startsWith: id } }))] },
      });
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      workspaceIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  async function seedUser(name: string): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: name.toLowerCase() } });
    userIds.push(id);
    return id;
  }

  async function createWorkspace(ownerId: string, name: string): Promise<string> {
    const res = await request(app).post("/api/v1/workspaces").set(auth(ownerId)).set("Idempotency-Key", `idem-${newObjectId()}`).send({ name });
    expect(res.status).toBe(201);
    workspaceIds.push(res.body.data.workspace.id as string);
    return res.body.data.workspace.id as string;
  }

  async function createChannel(ownerId: string, workspaceId: string, name: string, visibility: "PUBLIC" | "PRIVATE"): Promise<string> {
    const res = await request(app).post(`/api/v1/workspaces/${workspaceId}/channels`).set(auth(ownerId)).send({ name, visibility });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function scenario() {
    const owner = await seedUser("Chủ nhóm");
    const guest = await seedUser("Khách");
    const workspaceId = await createWorkspace(owner, "Nhóm cổng grant");
    await prisma.workspaceMembership.create({
      data: { workspaceId, userId: guest, role: "GUEST", status: "ACTIVE", expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
    const pub = await createChannel(owner, workspaceId, "Công khai", "PUBLIC");
    const priv = await createChannel(owner, workspaceId, "Riêng tư", "PRIVATE");
    const archived = await createChannel(owner, workspaceId, "Đã lưu trữ", "PUBLIC");
    await prisma.channel.update({ where: { id: archived }, data: { status: "ARCHIVED" } });

    const otherOwner = await seedUser("Chủ nhóm khác");
    const otherWs = await createWorkspace(otherOwner, "Nhóm khác");
    const foreign = await createChannel(otherOwner, otherWs, "Ngoài nhóm", "PUBLIC");
    return { owner, guest, workspaceId, pub, priv, archived, foreign, missing: newObjectId() };
  }

  const grantInTx = (input: Parameters<typeof port.grantMemberInTx>[1]) => withTransaction((tx) => port.grantMemberInTx(tx, input));
  const revokeInTx = (input: Parameters<typeof port.revokeMemberInTx>[1]) => withTransaction((tx) => port.revokeMemberInTx(tx, input));
  const once = <T>(client: ClientSocket, event: string): Promise<T> => new Promise((resolve) => client.once(event, resolve));

  it("grantMemberInTx: cấp DIRECT MEMBER cho kênh public + riêng tư; bỏ qua kênh đã lưu trữ / ngoài workspace / không tồn tại; memberCount + outbox đúng", async () => {
    const s = await scenario();
    const change = await grantInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.pub, s.priv, s.archived, s.foreign, s.missing, s.pub], actorId: s.owner });

    expect(change.granted.sort()).toEqual([s.pub, s.priv].sort());
    expect(change.already).toEqual([]);
    expect(change.skipped).toEqual(
      expect.arrayContaining([
        { channelId: s.archived, reason: "ARCHIVED" },
        { channelId: s.foreign, reason: "NOT_FOUND" },
        { channelId: s.missing, reason: "NOT_FOUND" },
      ])
    );
    expect(change.skipped).toHaveLength(3);

    for (const channelId of [s.pub, s.priv]) {
      const grant = await prisma.channelGrant.findUnique({ where: { channelId_subjectKey_source: { channelId, subjectKey: s.guest, source: "DIRECT" } } });
      expect(grant).toMatchObject({ userId: s.guest, subjectKey: s.guest, level: "MEMBER", source: "DIRECT", roleRef: null, grantedBy: s.owner });
      expect(await prisma.channelMembership.count({ where: { channelId, userId: s.guest } })).toBe(1);
      const outboxRow = await prisma.outboxEvent.findFirst({ where: { jobName: "channel.events", aggregateId: channelId, type: "channel.grant-added" } });
      expect(outboxRow?.payload).toMatchObject({ event: "granted", channelId, userIds: [s.guest], level: "MEMBER", via: "DIRECT" });
    }
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.priv } })).memberCount).toBe(2); // owner + khách
    expect(await prisma.channelGrant.count({ where: { channelId: s.archived } })).toBe(0);

    // Khách đọc được kênh riêng tư nhờ grant DIRECT.
    await port.afterCommit(change);
    expect((await request(app).get(`/api/v1/channels/${s.priv}`).set(auth(s.guest))).status).toBe(200);
  });

  it("idempotent: gọi lại → `already` (không tạo dòng/thông báo thêm, không đụng khoá unique)", async () => {
    const s = await scenario();
    await grantInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.pub, s.priv], actorId: s.owner });
    const again = await grantInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.pub, s.priv], actorId: s.owner });
    expect(again.granted).toEqual([]);
    expect(again.already.sort()).toEqual([s.pub, s.priv].sort());
    expect(await prisma.channelGrant.count({ where: { userId: s.guest } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { type: "channel.grant-added", aggregateId: { in: [s.pub, s.priv] } } })).toBe(2);
  });

  it("afterCommit: vào room ch: khi được cấp; revokeMemberInTx + afterCommit → channel:revoked, rời room, kênh riêng tư 404", async () => {
    const s = await scenario();
    const socket = await connectClient(harness.port, { token: socketTokenFor(s.guest, `${s.guest}@e.com`), deviceId: "dev-guest" });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const granted = await grantInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.priv], actorId: s.owner });
    await port.afterCommit(granted);
    expect((await harness.io.in(ROOM.channel(s.priv)).fetchSockets()).map((x) => x.data.user?.id)).toEqual([s.guest]);
    expect(await emitWithAck<{ ok: boolean }>(socket, "room:join", { kind: "ch", id: s.priv })).toEqual({ ok: true });

    const revokedEvent = once<Record<string, unknown>>(socket, "channel:revoked");
    const revoked = await revokeInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.priv, s.pub] });
    expect(revoked.revoked).toEqual([s.priv]); // `pub` chưa từng được cấp → không tính
    await port.afterCommit(revoked);

    expect(await revokedEvent).toMatchObject({ channelId: s.priv, workspaceId: s.workspaceId, via: "DIRECT" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await harness.io.in(ROOM.channel(s.priv)).fetchSockets()).toHaveLength(0);
    expect((await request(app).get(`/api/v1/channels/${s.priv}`).set(auth(s.guest))).status).toBe(404);
    expect(await prisma.channelMembership.count({ where: { channelId: s.priv, userId: s.guest } })).toBe(0);
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.priv } })).memberCount).toBe(1);
    socket.disconnect();
  });

  it("revokeAllInTx (khách hết hạn/bị loại): ghi outbox channel.membership-revoked → consumer p1-03 dọn mọi grant/membership của khách trong workspace", async () => {
    const s = await scenario();
    await grantInTx({ workspaceId: s.workspaceId, userId: s.guest, channelIds: [s.pub, s.priv], actorId: s.owner });

    await withTransaction((tx) => port.revokeAllInTx(tx, { workspaceId: s.workspaceId, userId: s.guest }));
    const row = await prisma.outboxEvent.findFirst({ where: { jobName: "channel.membership-revoked", aggregateId: `${s.workspaceId}:${s.guest}` } });
    expect(row?.payload).toMatchObject({ workspaceId: s.workspaceId, userId: s.guest });

    await processor("channel.membership-revoked")({ data: row!.payload });
    expect(await prisma.channelGrant.count({ where: { workspaceId: s.workspaceId, userId: s.guest } })).toBe(0);
    expect(await prisma.channelMembership.count({ where: { workspaceId: s.workspaceId, userId: s.guest } })).toBe(0);
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.priv } })).memberCount).toBe(1);
    expect((await request(app).get(`/api/v1/channels/${s.priv}`).set(auth(s.guest))).status).toBe(404);
  });

  it("revokeMemberInTx giữ quyền khi người đó vẫn được phủ bởi role grant (không nằm trong `revoked`, giữ membership)", async () => {
    const s = await scenario();
    const member = await seedUser("Thành viên");
    await prisma.workspaceMembership.create({ data: { workspaceId: s.workspaceId, userId: member, role: "MEMBER", status: "ACTIVE" } });
    expect((await request(app).post(`/api/v1/channels/${s.priv}/grants/roles`).set(auth(s.owner)).send({ roleRef: "MEMBER" })).status).toBe(201);
    await grantInTx({ workspaceId: s.workspaceId, userId: member, channelIds: [s.priv], actorId: s.owner });

    const change = await revokeInTx({ workspaceId: s.workspaceId, userId: member, channelIds: [s.priv] });
    expect(change.revoked).toEqual([]);
    expect(await prisma.channelGrant.count({ where: { channelId: s.priv, userId: member } })).toBe(0);
    expect(await prisma.channelMembership.count({ where: { channelId: s.priv, userId: member } })).toBe(1);
    expect((await request(app).get(`/api/v1/channels/${s.priv}`).set(auth(member))).status).toBe(200);
  });

  it("syncRoleAccessInTx: người mới ACTIVE nhận membership kênh riêng tư đã cấp cho vai trò của họ", async () => {
    const s = await scenario();
    await request(app).post(`/api/v1/channels/${s.priv}/grants/roles`).set(auth(s.owner)).send({ roleRef: "MEMBER" });
    const newcomer = await seedUser("Người mới");
    await withTransaction(async (tx) => {
      await tx.workspaceMembership.create({ data: { workspaceId: s.workspaceId, userId: newcomer, role: "MEMBER", status: "ACTIVE" } });
      await port.syncRoleAccessInTx(tx, { workspaceId: s.workspaceId, userId: newcomer });
    });
    expect(await prisma.channelMembership.count({ where: { channelId: s.priv, userId: newcomer } })).toBe(1);
    expect((await request(app).get(`/api/v1/channels/${s.priv}`).set(auth(newcomer))).status).toBe(200);
  });
});
