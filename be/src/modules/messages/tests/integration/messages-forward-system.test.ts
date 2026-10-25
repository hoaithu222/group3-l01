/**
 * Integration — chuyển tiếp nhiều đích + tin hệ thống (MSG-08, MSG-15) trên
 * adapter CHANNEL thật (Mongo memory replset). Bổ sung cho
 * `messages.routes.test.ts` (đã có sẵn: chuyển tiếp 1 đích SENT + retry +
 * `directUserId` → MSG_017 — KHÔNG lặp lại ở đây, chỉ thêm ca 3 đích với 1
 * đích bị từ chối THẬT vì thiếu quyền ghi, khác MSG_017).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

const redisStore = new Map<string, unknown>();
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
function redisIncrImpl(key: string): Promise<number> {
  const next = ((redisStore.get(key) as number) ?? 0) + 1;
  redisStore.set(key, next);
  return Promise.resolve(next);
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
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../messages.routes";
import { createSystemMessageService } from "../../public";

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

describe("messages forward & system messages — MSG-08, MSG-15", () => {
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
    (redis.getdel as jest.Mock).mockImplementation(() => Promise.resolve(null));
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockResolvedValue(false);
    (redis.setNx as jest.Mock).mockResolvedValue(true);
    (redis.hset as jest.Mock).mockResolvedValue(undefined);
    (redis.hgetall as jest.Mock).mockResolvedValue({});
    (redis.hdel as jest.Mock).mockResolvedValue(undefined);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
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
    mockAuditRecord.mockClear();
  });

  it(
    "MSG-08: chuyển tiếp tới 3 kênh, 1 kênh bị từ chối vì KHÔNG có quyền ghi (ADMINS_ONLY) → 2 SENT + 1 DENIED; retry cùng forwardRequestId → không tạo thêm",
    async () => {
      const owner = await seedUser("Chủ nhóm");
      const member = await seedUser("Thành viên thường");
      createdUserIds.push(owner.id, member.id);

      const ws = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm chuyển tiếp" });
      const workspaceId = ws.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);
      await prisma.workspaceMembership.create({ data: { workspaceId, userId: member.id, role: "MEMBER", status: "ACTIVE" } });

      const source = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh nguồn", visibility: "PUBLIC" });
      const target1 = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Đích 1 mở", visibility: "PUBLIC" });
      const target2 = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Đích 2 mở", visibility: "PUBLIC" });
      const target3 = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Đích 3 chỉ admin gửi", visibility: "PUBLIC", postingPolicy: "ADMINS_ONLY" });
      const sourceId = source.body.data.id as string;
      const target1Id = target1.body.data.id as string;
      const target2Id = target2.body.data.id as string;
      const target3Id = target3.body.data.id as string;

      const original = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${sourceId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ clientMessageId: randomUUID(), content: "Tin nguồn để chuyển tiếp 3 đích" });
      expect(original.status).toBe(201);
      const sourceMessageId = original.body.data.id as string;

      const forwardRequestId = randomUUID();
      const doForward = () =>
        request(app)
          .post(`/api/v1/messages/${sourceMessageId}/forward`)
          .set("Authorization", `Bearer ${tokenFor(member.id)}`) // member thường — KHÔNG có "manage" ở target3 (ADMINS_ONLY)
          .send({
            forwardRequestId,
            targets: [
              { scopeType: "CHANNEL", scopeId: target1Id },
              { scopeType: "CHANNEL", scopeId: target2Id },
              { scopeType: "CHANNEL", scopeId: target3Id },
            ],
          });

      const first = await doForward();
      expect(first.status).toBe(200);
      const results1 = first.body.data.results as Array<{ status: string; scopeId?: string; messageId?: string; code?: string }>;
      expect(results1).toHaveLength(3);
      expect(results1[0]).toMatchObject({ status: "SENT", scopeId: target1Id });
      expect(results1[1]).toMatchObject({ status: "SENT", scopeId: target2Id });
      expect(results1[2]).toMatchObject({ status: "DENIED", code: "MSG_004" });

      const count1Target1 = await prisma.message.count({ where: { scopeId: target1Id } });
      const count1Target2 = await prisma.message.count({ where: { scopeId: target2Id } });
      const count1Target3 = await prisma.message.count({ where: { scopeId: target3Id } });
      expect(count1Target1).toBe(1);
      expect(count1Target2).toBe(1);
      expect(count1Target3).toBe(0);

      // Retry CÙNG forwardRequestId → idempotent, không tạo thêm tin nào.
      const second = await doForward();
      expect(second.status).toBe(200);
      const results2 = second.body.data.results as Array<{ status: string; scopeId?: string; messageId?: string; code?: string }>;
      expect(results2[0].messageId).toBe(results1[0].messageId);
      expect(results2[1].messageId).toBe(results1[1].messageId);

      const count2Target1 = await prisma.message.count({ where: { scopeId: target1Id } });
      const count2Target2 = await prisma.message.count({ where: { scopeId: target2Id } });
      expect(count2Target1).toBe(1);
      expect(count2Target2).toBe(1);
    },
    30_000
  );

  it("MSG-15: đăng cùng 1 tin hệ thống với cùng dedupeKey 3 lần → đúng 1 tin trong DB", async () => {
    const owner = await seedUser();
    createdUserIds.push(owner.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm tin hệ thống" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh tin hệ thống", visibility: "PUBLIC" });
    const channelId = ch.body.data.id as string;

    const systemMessageService = createSystemMessageService();
    const dedupeKey = `test-dedupe-${randomUUID()}`;
    const input = {
      scopeType: "CHANNEL" as const,
      scopeId: channelId,
      systemType: "MEMBER_JOINED" as const,
      payload: { userId: newObjectId() },
      dedupeKey,
    };

    // Gọi TUẦN TỰ (không song song) — mô phỏng đúng be.md README MSG-15 "gửi 3
    // lần" (retry theo thời gian, vd job at-least-once), không phải race
    // đồng thời; `post()` không catch `P2002` nội bộ (khác `message.service
    // .ts#send()`), nên 2 request THẬT SỰ đồng thời cùng dedupeKey mới toanh
    // sẽ ném lỗi ở phía thua cuộc — ngoài phạm vi ca nghiệm thu này.
    const m1 = await systemMessageService.post(input);
    const m2 = await systemMessageService.post(input);
    const m3 = await systemMessageService.post(input);

    expect(m1.id).toBe(m2.id);
    expect(m2.id).toBe(m3.id);
    expect(m1.kind).toBe("SYSTEM");
    expect(m1.authorId).toBeNull();
    expect(m1.dedupeKey).toBe(`s:${dedupeKey}`);

    const count = await prisma.message.count({ where: { scopeId: channelId, kind: "SYSTEM", dedupeKey: `s:${dedupeKey}` } });
    expect(count).toBe(1);
  });
});
