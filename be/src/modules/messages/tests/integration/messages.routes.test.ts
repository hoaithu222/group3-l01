/**
 * Integration — `/scopes/CHANNEL/:id/messages`, `/channels/:id/messages`
 * (alias), `/messages/:id*` trên Prisma thật (Mongo memory replset,
 * `TEST_DB=memory`). Redis mock STATEFUL + Socket.IO THẬT (`startHarness`) —
 * cùng lý do `channels.routes.test.ts` (`emitToUsers`/`emitToRoom` chạm
 * `getIO()` thật trong request `hide`/hoạt động outbox-independent).
 *
 * Smoke-test luồng chính p1-04 be.md §5/§10 trên adapter CHANNEL thật (p1-03)
 * — KHÔNG lặp lại toàn bộ ma trận nghiệm thu (be.md README TX-01..08,
 * MSG-01..15) mà tác vụ p1-04 này không bắt buộc viết đầy đủ (uỷ quyền pass
 * test riêng sau) — chỉ xác nhận pipeline THẬT (tx/Counter `$runCommandRaw`,
 * composite type Prisma, AssetLink, outbox, emit) không vỡ ở runtime, thứ
 * `tsc`/`npm run build` không bắt được.
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
import messagesRoutes, { createScopedMessageRouter } from "../../messages.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
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

async function seedReadyAsset(ownerId: string, overrides: Partial<Parameters<typeof prisma.asset.create>[0]["data"]> = {}) {
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

describe("/scopes/CHANNEL/:id/messages*, /channels/:id/messages, /messages/:id* (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();

    // `global-setup.ts` chỉ khởi `MongoMemoryReplSet` RỖNG (không `prisma db
    // push`) — tự tạo 2 index unique của `Message` (be.md §2) mà nghiệp vụ
    // idempotency/seq dựa vào (P2002 phải thật ném ra khi trùng).
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
        await prisma.messageHide.deleteMany({ where: { scopeId: { in: channelIds } } });
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
      .send({ name: "Nhóm nhắn tin" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh chat", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    return { ownerId: owner.id, workspaceId, channelId: ch.body.data.id as string };
  }

  it("gửi tin → 201, seq=1; gửi lại cùng clientMessageId → 200 Idempotent-Replayed, không tạo tin mới (MSG-02)", async () => {
    const { ownerId, channelId } = await setupChannel();
    const clientMessageId = "11111111-1111-4111-8111-111111111111";

    const first = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId, content: "Xin chào cả nhà" });
    expect(first.status).toBe(201);
    expect(first.body.data.seq).toBe(1);
    expect(first.body.data.content).toBe("Xin chào cả nhà");
    expect(first.body.data.myPermissions).toMatchObject({ canEdit: true, canRecall: true, canReply: true });

    const replay = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId, content: "Xin chào cả nhà" });
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body.data.id).toBe(first.body.data.id);

    const count = await prisma.message.count({ where: { scopeId: channelId } });
    expect(count).toBe(1);
  });

  it("gửi tin rỗng (không content, không tệp) → 400 MSG_007", async () => {
    const { ownerId, channelId } = await setupChannel();
    const res = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "22222222-2222-4222-8222-222222222222" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MSG_007");
  });

  it("gửi tệp đính kèm READY của chính mình → 201 với attachments; asset của người khác → 400 MSG_005", async () => {
    const { ownerId, channelId } = await setupChannel();
    const other = await seedUser("Người khác");
    createdUserIds.push(other.id);

    const myAsset = await seedReadyAsset(ownerId);
    const foreignAsset = await seedReadyAsset(other.id);

    const ok = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "33333333-3333-4333-8333-333333333333", attachments: [{ assetId: myAsset.id }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.attachments).toHaveLength(1);
    expect(ok.body.data.attachments[0]).toMatchObject({ assetId: myAsset.id, kind: "IMAGE" });

    const link = await prisma.assetLink.findFirst({ where: { assetId: myAsset.id, targetType: "MESSAGE", targetId: ok.body.data.id } });
    expect(link).not.toBeNull();

    const denied = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "44444444-4444-4444-8444-444444444444", attachments: [{ assetId: foreignAsset.id }] });
    expect(denied.status).toBe(400);
    expect(denied.body.error.code).toBe("MSG_005");
  });

  it("danh sách/get/edit/version-conflict/thu hồi (tombstone)", async () => {
    const { ownerId, channelId } = await setupChannel();

    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "55555555-5555-4555-8555-555555555555", content: "Bản gốc" });
    const messageId = sent.body.data.id as string;

    const list = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ hasMoreBefore: false, hasMoreAfter: false });

    const aliasList = await request(app)
      .get(`/api/v1/channels/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(aliasList.status).toBe(200);
    expect(aliasList.body.data).toHaveLength(1);

    const get = await request(app).get(`/api/v1/messages/${messageId}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(get.status).toBe(200);
    expect(get.body.data.version).toBe(1);

    const badVersion = await request(app)
      .patch(`/api/v1/messages/${messageId}`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ content: "Sửa sai version", mentions: [], expectedVersion: 99 });
    expect(badVersion.status).toBe(409);
    expect(badVersion.body.error.code).toBe("RES_003");

    const edited = await request(app)
      .patch(`/api/v1/messages/${messageId}`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ content: "Bản đã sửa", mentions: [], expectedVersion: 1 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.content).toBe("Bản đã sửa");
    expect(edited.body.data.version).toBe(2);
    expect(edited.body.data.editedAt).not.toBeNull();

    const recalled = await request(app).delete(`/api/v1/messages/${messageId}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(recalled.status).toBe(200);
    expect(recalled.body.data.deletedAt).not.toBeNull();

    const getAfter = await request(app).get(`/api/v1/messages/${messageId}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(getAfter.status).toBe(200);
    expect(getAfter.body.data.deleted).toBe(true);
    expect(getAfter.body.data.content).toBeNull();

    const link = await prisma.assetLink.findFirst({ where: { targetType: "MESSAGE", targetId: messageId } });
    expect(link).toBeNull();
  }, 20_000);

  it("react/unreact idempotent, count đúng; pin/unpin idempotent (MSG-06)", async () => {
    const { ownerId, channelId } = await setupChannel();
    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "66666666-6666-4666-8666-666666666666", content: "Tin để react" });
    const messageId = sent.body.data.id as string;

    const [r1, r2] = await Promise.all([
      request(app).put(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("👍")}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`),
      request(app).put(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("👍")}`).set("Authorization", `Bearer ${tokenFor(ownerId)}`),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(r1.body.data.count).toBe(1);
    expect(r2.body.data.count).toBe(1);

    const invalidEmoji = await request(app)
      .put(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("abc")}`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(invalidEmoji.status).toBe(400);
    expect(invalidEmoji.body.error.code).toBe("MSG_013");

    const unreact = await request(app)
      .delete(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent("👍")}`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(unreact.status).toBe(200);
    expect(unreact.body.data.count).toBe(0);

    const pin1 = await request(app).post(`/api/v1/messages/${messageId}/pin`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(pin1.status).toBe(200);
    expect(pin1.body.data.pinned).toBe(true);
    const pin2 = await request(app).post(`/api/v1/messages/${messageId}/pin`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(pin2.status).toBe(200);
    expect(pin2.body.data.pinned).toBe(true);

    const pins = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/pins`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(pins.status).toBe(200);
    expect(pins.body.data).toHaveLength(1);

    const unpin = await request(app).delete(`/api/v1/messages/${messageId}/pin`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(unpin.status).toBe(200);
    expect(unpin.body.data.pinned).toBe(false);
  }, 20_000);

  it("ẩn phía tôi lọc khỏi danh sách của chính mình, không ảnh hưởng người khác (MSG-05)", async () => {
    const { ownerId, workspaceId, channelId } = await setupChannel();
    const other = await seedUser("Người xem khác");
    createdUserIds.push(other.id);
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: other.id, role: "MEMBER", status: "ACTIVE" } });
    await request(app).post(`/api/v1/channels/${channelId}/join`).set("Authorization", `Bearer ${tokenFor(other.id)}`);

    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "77777777-7777-4777-8777-777777777777", content: "Tin sẽ bị ẩn" });
    const messageId = sent.body.data.id as string;

    const hide = await request(app).post(`/api/v1/messages/${messageId}/hide`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(hide.status).toBe(200);
    expect(hide.body.data.hidden).toBe(true);

    const listOwner = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(listOwner.body.data.map((m: { id: string }) => m.id)).not.toContain(messageId);

    const listOther = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(other.id)}`);
    expect(listOther.body.data.map((m: { id: string }) => m.id)).toContain(messageId);

    const unhide = await request(app).delete(`/api/v1/messages/${messageId}/hide`).set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(unhide.status).toBe(200);
    const listAfter = await request(app)
      .get(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`);
    expect(listAfter.body.data.map((m: { id: string }) => m.id)).toContain(messageId);
  });

  it("chuyển tiếp tới kênh khác → SENT, tin mới có forwardedFrom; gửi lại cùng forwardRequestId → không tạo thêm (MSG-08)", async () => {
    const { ownerId, workspaceId, channelId } = await setupChannel();
    const target = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ name: "Kênh đích", visibility: "PUBLIC" });
    const targetChannelId = target.body.data.id as string;

    const source = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ clientMessageId: "88888888-8888-4888-8888-888888888888", content: "Tin gốc để chuyển tiếp" });
    const sourceId = source.body.data.id as string;

    const forwardRequestId = "99999999-9999-4999-8999-999999999999";
    const fwd1 = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ forwardRequestId, targets: [{ scopeType: "CHANNEL", scopeId: targetChannelId }] });
    expect(fwd1.status).toBe(200);
    expect(fwd1.body.data.results[0]).toMatchObject({ status: "SENT", scopeId: targetChannelId });

    const fwd2 = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ forwardRequestId, targets: [{ scopeType: "CHANNEL", scopeId: targetChannelId }] });
    expect(fwd2.status).toBe(200);
    expect(fwd2.body.data.results[0].status).toBe("SENT");
    expect(fwd2.body.data.results[0].messageId).toBe(fwd1.body.data.results[0].messageId);

    const count = await prisma.message.count({ where: { scopeId: targetChannelId } });
    expect(count).toBe(1);
    const forwarded = await prisma.message.findUnique({ where: { id: fwd1.body.data.results[0].messageId } });
    expect(forwarded?.forwardedFrom).toMatchObject({ messageId: sourceId, authorId: ownerId });

    // Chuyển tiếp tới `directUserId` — p1-05 chưa tồn tại → DENIED MSG_017 (mục 6 báo cáo).
    const fwdDirect = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .send({ forwardRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", targets: [{ directUserId: newObjectId() }] });
    expect(fwdDirect.status).toBe(200);
    expect(fwdDirect.body.data.results[0]).toMatchObject({ status: "DENIED", code: "MSG_017" });
  }, 20_000);

  it("scope CONVERSATION chưa đăng ký adapter → 404 (registry rỗng, mục 3 báo cáo)", async () => {
    const owner = await seedUser();
    createdUserIds.push(owner.id);
    const res = await request(app)
      .get(`/api/v1/scopes/CONVERSATION/${newObjectId()}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(res.status).toBe(404);
  });
});
