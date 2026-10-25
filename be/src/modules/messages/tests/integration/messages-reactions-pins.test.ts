/**
 * Integration — reaction/ghim p1-04 dưới tải/giới hạn (MSG-06, MSG-07) trên
 * adapter CHANNEL thật (Mongo memory replset). Bổ sung cho
 * `messages.routes.test.ts` (đã có react/unreact/pin/unpin CƠ BẢN — file này
 * thêm khẳng định Ở TẦNG DB cho MSG-06 và ca giới hạn MSG-07 chưa có).
 *
 * Regression bug #2 (báo cáo tác vụ): `reaction.repository.prisma.ts#add()`
 * CỐ Ý không bắt `P2002` bên trong `withTransaction` (bắt-rồi-tiếp-tục trong
 * transaction Mongo làm session "nhiễm độc", ném `P2028` ở lệnh kế tiếp) — de-dup
 * thật nằm ở `MessageInteractionService.react()` bắt `P2002` NGOÀI transaction.
 * Test MSG-06 dưới đây gửi 2 request PUT reaction cùng emoji SONG SONG và
 * kiểm: (1) không request nào 500, (2) đúng 1 dòng `MessageReaction` trong DB
 * (không chỉ tin ở `count` trả về response).
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
/** MSG-07 kiểm giới hạn GHIM, không phải burst gửi tin (5 tin/5 giây, `rl:msg:*`): xoá bộ đếm đó trước mỗi lượt seed để 20 tin liên tiếp không dính RATE_002. */
function dropSendLimiter(): void {
  for (const key of [...redisStore.keys()]) if (key.startsWith("rl:msg:")) redisStore.delete(key);
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
import { LIMITS } from "../../../../core/constants/limits";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../messages.routes";

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

describe("messages reactions & pins — MSG-06, MSG-07", () => {
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
      createIndexes: "MessageReaction",
      indexes: [{ key: { messageId: 1, userId: 1, emoji: 1 }, name: "MessageReaction_messageId_userId_emoji_key", unique: true }],
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
        await prisma.messageReaction.deleteMany({ where: { scopeId: { in: channelIds } } });
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

  async function setupChannel(): Promise<{ ownerId: string; workspaceId: string; channelId: string }> {
    const owner = await seedUser();
    createdUserIds.push(owner.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm react/pin" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh react/pin", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    return { ownerId: owner.id, workspaceId, channelId: ch.body.data.id as string };
  }

  it("MSG-06: 2 request PUT reaction cùng emoji SONG SONG → không 500, đúng 1 dòng MessageReaction trong DB", async () => {
    const { ownerId, channelId } = await setupChannel();
    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: randomUUID(), content: "Tin để react đua" });
    const messageId = sent.body.data.id as string;

    const [r1, r2] = await Promise.all([
      request(app).put(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("🔥")}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`),
      request(app).put(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("🔥")}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`),
    ]);

    expect(r1.status).not.toBe(500);
    expect(r2.status).not.toBe(500);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.data.count).toBe(1);
    expect(r2.body.data.count).toBe(1);

    const rows = await prisma.messageReaction.findMany({ where: { messageId, userId: ownerId, emoji: "🔥" } });
    expect(rows).toHaveLength(1);

    const dbMessage = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(dbMessage.reactionsSummary).toEqual([{ emoji: "🔥", count: 1 }]);
  });

  it(
    `MSG-07: ghim tin thứ (pinMax+1)=${LIMITS.channel.pinMax + 1} trong kênh → 409 MSG_010`,
    async () => {
      const { ownerId, channelId } = await setupChannel();
      const pinMax = LIMITS.channel.pinMax;

      // pinMax tin đầu ghim thẳng qua DB (bỏ qua HTTP cho nhanh) — vẫn là bản
      // ghi Message THẬT (seq cấp bởi service thật qua HTTP) nên
      // `countPinned()` (đếm thật trong DB) phản ánh đúng số tin đã ghim.
      const seeded: string[] = [];
      for (let i = 0; i < pinMax; i += 1) {
        dropSendLimiter();
        const res = await request(app)
          .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
          .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
          .send({ clientMessageId: randomUUID(), content: `Tin ghim #${i}` });
        expect(res.status).toBe(201);
        seeded.push(res.body.data.id as string);
      }
      await prisma.message.updateMany({
        where: { id: { in: seeded } },
        data: { pinnedAt: new Date(), pinnedBy: ownerId },
      });
      const pinnedCountBefore = await prisma.message.count({ where: { scopeType: "CHANNEL", scopeId: channelId, pinnedAt: { not: null } } });
      expect(pinnedCountBefore).toBe(pinMax);

      const extra = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), content: `Tin thứ ${pinMax + 1}` });
      expect(extra.status).toBe(201);

      const pinAttempt = await request(app)
        .post(`/api/v1/messages/${extra.body.data.id}/pin`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(pinAttempt.status).toBe(409);
      expect(pinAttempt.body.error.code).toBe("MSG_010");

      const stillNotPinned = await prisma.message.findUniqueOrThrow({ where: { id: extra.body.data.id } });
      expect(stillNotPinned.pinnedAt).toBeNull();
    },
    30_000
  );
});
