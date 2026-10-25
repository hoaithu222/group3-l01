/**
 * Integration — sửa/thu hồi/đính kèm p1-04 (TX-04, TX-05, TX-06, MSG-04) trên
 * adapter CHANNEL thật (Mongo memory replset). Bổ sung cho
 * `messages.routes.test.ts` (đã có sẵn: asset người khác → MSG_005, sửa
 * version cũ → RES_003, thu hồi cơ bản — KHÔNG lặp lại các ca đó ở đây).
 *
 * Regression bug #1 (báo cáo tác vụ): `message.repository.prisma.ts#create()`
 * PHẢI ghi tường minh `null` cho `deletedAt/pinnedAt/pinnedBy/editedAt` lúc
 * tạo — Prisma+MongoDB KHÔNG khớp field THIẾU với filter `{field: null}`
 * trong `updateMany` (khác MongoDB thật). Một hồi quy ở đây khiến MỌI
 * `edit`/`recall`/`pin` sau đó lặng lẽ trả `count: 0` (không throw) — test
 * "tồn tại bảo vệ" bên dưới đọc lại DB TRỰC TIẾP (không chỉ tin ở response
 * HTTP 200) sau edit/pin/recall để bắt được hồi quy dạng "âm thầm không ghi".
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

async function seedAsset(
  ownerId: string,
  overrides: Partial<Parameters<typeof prisma.asset.create>[0]["data"]> = {}
) {
  const id = newObjectId();
  return prisma.asset.create({
    data: {
      id,
      ownerId,
      scope: "MESSAGE",
      kind: "IMAGE",
      variant: "ORIGINAL",
      status: "READY",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 1024,
      size: 1024,
      originalName: "anh.png",
      storageKey: `test/${id}/original.png`,
      readyAt: new Date(),
      ...overrides,
    },
  });
}

describe("messages edit/recall/attachments — TX-04, TX-05, TX-06, MSG-04", () => {
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
        await prisma.assetLink.deleteMany({ where: { scopeId: { in: channelIds } } });
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
      await prisma.asset.deleteMany({ where: { ownerId: { in: createdUserIds } } });
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
      .send({ name: "Nhóm sửa/thu hồi" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh sửa/thu hồi", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    return { ownerId: owner.id, workspaceId, channelId: ch.body.data.id as string };
  }

  describe("TX-04 — đính kèm", () => {
    it("asset CHƯA READY (đang upload) → 400 MSG_005", async () => {
      const { ownerId, channelId } = await setupChannel();
      const notReady = await seedAsset(ownerId, { status: "UPLOADING", readyAt: null });

      const res = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), attachments: [{ assetId: notReady.id }] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MSG_005");
    });

    it("assetId không tồn tại → 400 MSG_005", async () => {
      const { ownerId, channelId } = await setupChannel();
      const res = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), attachments: [{ assetId: newObjectId() }] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MSG_005");
    });

    it(
      "6 tệp đính kèm (vượt attachmentsMax=5) → 400 VAL_001 (Zod .max() chặn TRƯỚC khi tới service — MSG_002 hiện không thể tới được qua HTTP, xem báo cáo tác vụ)",
      async () => {
        const { ownerId, channelId } = await setupChannel();
        const assets = await Promise.all(Array.from({ length: 6 }, () => seedAsset(ownerId)));
        const res = await request(app)
          .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
          .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
          .send({ clientMessageId: randomUUID(), attachments: assets.map((a) => ({ assetId: a.id })) });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VAL_001");
      }
    );
  });

  describe("TX-05 — cửa sổ sửa", () => {
    it("sửa tin quá editWindowSeconds (15 phút) → 409 MSG_003", async () => {
      const { ownerId, channelId } = await setupChannel();
      const sent = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), content: "Tin cũ" });
      const messageId = sent.body.data.id as string;

      // Lùi createdAt về 16 phút trước (vượt 15 phút editWindowSeconds).
      await prisma.message.updateMany({
        where: { id: messageId },
        data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
      });

      const edit = await request(app)
        .patch(`/api/v1/messages/${messageId}`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ content: "Sửa quá muộn", mentions: [], expectedVersion: 1 });
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe("MSG_003");
    });
  });

  describe("TX-06 — thu hồi tin có trả lời trỏ tới", () => {
    it("thu hồi tin gốc → tombstone; tin trả lời giữ replyToId nhưng replyPreview.deleted=true", async () => {
      const { ownerId, channelId } = await setupChannel();
      const original = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), content: "Tin sẽ bị thu hồi" });
      const originalId = original.body.data.id as string;

      const reply = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), content: "Trả lời tin trên", replyToId: originalId });
      expect(reply.status).toBe(201);
      const replyId = reply.body.data.id as string;
      expect(reply.body.data.replyPreview).toMatchObject({ authorId: ownerId, deleted: false });

      const recall = await request(app)
        .delete(`/api/v1/messages/${originalId}`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(recall.status).toBe(200);

      const originalAfter = await request(app)
        .get(`/api/v1/messages/${originalId}`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(originalAfter.body.data.deleted).toBe(true);
      expect(originalAfter.body.data.content).toBeNull();
      // Tombstone giữ id/seq/replyToId (be.md §2) — không hỏng tin trả lời trỏ tới.
      expect(originalAfter.body.data.id).toBe(originalId);

      const replyAfter = await request(app)
        .get(`/api/v1/messages/${replyId}`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(replyAfter.status).toBe(200);
      expect(replyAfter.body.data.replyToId).toBe(originalId);
      expect(replyAfter.body.data.replyPreview.deleted).toBe(true);
      expect(replyAfter.body.data.deleted).toBe(false); // chính tin trả lời KHÔNG bị xoá
    }, 20_000);
  });

  describe("MSG-04 — thu hồi tin có ảnh đính kèm", () => {
    it("thu hồi tin có ảnh → AssetLink bị detach thật, attachments rỗng cả HTTP lẫn DB", async () => {
      const { ownerId, channelId } = await setupChannel();
      const asset = await seedAsset(ownerId);

      const sent = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), attachments: [{ assetId: asset.id }] });
      expect(sent.status).toBe(201);
      const messageId = sent.body.data.id as string;
      expect(sent.body.data.attachments).toHaveLength(1);

      const linkBefore = await prisma.assetLink.findFirst({ where: { assetId: asset.id, targetType: "MESSAGE", targetId: messageId } });
      expect(linkBefore).not.toBeNull();

      const recall = await request(app).delete(`/api/v1/messages/${messageId}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(recall.status).toBe(200);

      const linkAfter = await prisma.assetLink.findFirst({ where: { assetId: asset.id, targetType: "MESSAGE", targetId: messageId } });
      expect(linkAfter).toBeNull();

      const dbMessage = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(dbMessage.attachments).toEqual([]);
      expect(dbMessage.deletedAt).not.toBeNull();
    });
  });

  describe("Regression bug #1 — field null tường minh lúc create()", () => {
    it("create → edit → pin → recall đều THỰC SỰ ghi DB (không chỉ trả 200) — quy hồi cho field deletedAt/pinnedAt/editedAt thiếu lúc create()", async () => {
      const { ownerId, channelId } = await setupChannel();
      const sent = await request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId: randomUUID(), content: "Bản đầu" });
      const messageId = sent.body.data.id as string;

      const created = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(created.deletedAt).toBeNull();
      expect(created.pinnedAt).toBeNull();
      expect(created.editedAt).toBeNull();

      const edit = await request(app)
        .patch(`/api/v1/messages/${messageId}`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ content: "Bản sửa", mentions: [], expectedVersion: 1 });
      expect(edit.status).toBe(200);
      const afterEdit = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      // Nếu `updateMany({where:{deletedAt:null}})` không khớp field thiếu, `count`
      // sẽ là 0 và version/content KHÔNG đổi dù HTTP vẫn trả 200 (tombstone giả read-after).
      expect(afterEdit.version).toBe(2);
      expect(afterEdit.content).toBe("Bản sửa");
      expect(afterEdit.editedAt).not.toBeNull();

      const pin = await request(app).post(`/api/v1/messages/${messageId}/pin`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(pin.status).toBe(200);
      const afterPin = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(afterPin.pinnedAt).not.toBeNull();
      expect(afterPin.pinnedBy).toBe(ownerId);

      const recall = await request(app).delete(`/api/v1/messages/${messageId}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
      expect(recall.status).toBe(200);
      const afterRecall = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(afterRecall.deletedAt).not.toBeNull();
      expect(afterRecall.pinnedAt).toBeNull(); // recall bỏ ghim
      expect(afterRecall.version).toBe(3);
    }, 20_000);
  });
});
