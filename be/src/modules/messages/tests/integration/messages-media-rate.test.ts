/**
 * Integration — MSG-09 (chuyển tiếp ảnh từ kênh riêng tư: quyền tải đi theo `AssetLink`
 * của tin ĐÍCH, không mở được tin gốc) và MSG-12 (giới hạn tốc độ gửi tin: tin thứ 6
 * trong 5 giây → 429 `RATE_002` + `retryAfterSeconds`) trên Mongo memory replset thật.
 * (MSG-03/10/11 kiểm ở unit: `send-message.dto.test.ts`, `message.service.*.test.ts`.)
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
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
import { createAssetAccessService } from "../../../assets/public";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
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
const store = makeRedisStore();
jest.setTimeout(60_000);

const auth = (id: string): string => `Bearer ${tokenFor(id)}`;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("messages — MSG-09 (chuyển tiếp ảnh kênh riêng tư), MSG-12 (giới hạn tốc độ gửi)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

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
    const channelIds = (
      await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })
    ).map((c) => c.id);
    if (channelIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
      await prisma.assetLink.deleteMany({ where: { scopeId: { in: channelIds } } });
    }
    await prisma.asset.deleteMany({ where: { ownerId: { in: userIds } } });
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

  async function newUser(name: string): Promise<string> {
    const u = await seedUser({ name });
    userIds.push(u.id);
    return u.id;
  }

  async function newWorkspace(ownerId: string, memberIds: string[]): Promise<string> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(ownerId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm media & rate" });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const id of memberIds) await addMembership(workspaceId, id, "MEMBER");
    return workspaceId;
  }

  async function newChannel(ownerId: string, workspaceId: string, visibility: "PUBLIC" | "PRIVATE", initialMemberIds: string[] = []): Promise<string> {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(ownerId))
      .send({ name: `Kênh ${randomUUID().slice(0, 8)}`, visibility, initialMemberIds });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it("MSG-09: chuyển tiếp ảnh từ kênh RIÊNG TƯ sang kênh khác → người ở đích tải được ảnh qua link của tin mới, KHÔNG mở được tin gốc", async () => {
    const owner = await newUser("Chủ kênh riêng");
    const viewer = await newUser("Thành viên chỉ ở kênh đích");
    const workspaceId = await newWorkspace(owner, [viewer]);
    const privateChannel = await newChannel(owner, workspaceId, "PRIVATE");
    const targetChannel = await newChannel(owner, workspaceId, "PUBLIC");

    const assetId = newObjectId();
    await prisma.asset.create({
      data: {
        id: assetId,
        ownerId: owner,
        scope: "MESSAGE",
        kind: "IMAGE",
        variant: "ORIGINAL",
        status: "READY",
        uploadMethod: "API_PUT",
        mime: "image/png",
        declaredSize: 1024,
        size: 1024,
        originalName: "anh-rieng-tu.png",
        storageKey: `test/${assetId}/original.png`,
        readyAt: new Date(),
      },
    });
    const sent = await request(app)
      .post(`/api/v1/channels/${privateChannel}/messages`)
      .set("Authorization", auth(owner))
      .send({ clientMessageId: randomUUID(), attachments: [{ assetId }] });
    expect(sent.status).toBe(201);
    const sourceMessageId = sent.body.data.id as string;

    const access = createAssetAccessService();
    const subject = async () => prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    const viewerUser = { id: viewer, email: `${viewer}@e.com` };

    // Trước khi chuyển tiếp: viewer KHÔNG đọc được ảnh (chỉ gắn vào kênh riêng tư mà viewer không có grant).
    await expect(access.canRead(viewerUser, await subject())).resolves.toBe(false);

    const forward = await request(app)
      .post(`/api/v1/messages/${sourceMessageId}/forward`)
      .set("Authorization", auth(owner))
      .send({ forwardRequestId: randomUUID(), targets: [{ scopeType: "CHANNEL", scopeId: targetChannel }] });
    expect(forward.status).toBe(200);
    expect(forward.body.data.results).toHaveLength(1);
    expect(forward.body.data.results[0]).toMatchObject({ status: "SENT", scopeType: "CHANNEL", scopeId: targetChannel });
    const newMessageId = forward.body.data.results[0].messageId as string;

    // Ảnh giờ có 2 link (tin gốc + tin mới); quyền đọc theo link của tin ĐÍCH.
    const links = await prisma.assetLink.findMany({ where: { assetId, targetType: "MESSAGE" } });
    expect(links.map((l) => l.targetId).sort()).toEqual([sourceMessageId, newMessageId].sort());
    await expect(access.canRead(viewerUser, await subject())).resolves.toBe(true);

    // Tin mới đọc được (kênh đích), tin gốc ở kênh riêng tư thì 404 trung tính.
    const newMsg = await request(app).get(`/api/v1/messages/${newMessageId}`).set("Authorization", auth(viewer));
    expect(newMsg.status).toBe(200);
    expect(newMsg.body.data.attachments).toHaveLength(1);
    expect(newMsg.body.data.forwardedFrom).toMatchObject({ messageId: sourceMessageId, scopeType: "CHANNEL" });
    const original = await request(app).get(`/api/v1/messages/${sourceMessageId}`).set("Authorization", auth(viewer));
    expect(original.status).toBe(404);
  });

  it("MSG-12: 6 tin trong 5 giây cùng kênh → tin thứ 6 nhận 429 RATE_002 + retryAfterSeconds; người khác cùng kênh không bị ảnh hưởng", async () => {
    const owner = await newUser("Chủ kênh MSG-12");
    const spammer = await newUser("Người gửi dồn dập");
    const bystander = await newUser("Người gửi bình thường");
    const workspaceId = await newWorkspace(owner, [spammer, bystander]);
    const channelId = await newChannel(owner, workspaceId, "PUBLIC");

    // Cửa sổ giới hạn cố định 5 giây theo đồng hồ — bắt đầu ở đầu 1 cửa sổ mới để 6 request không vắt qua ranh giới.
    const remainingInWindow = 5000 - (Date.now() % 5000);
    if (remainingInWindow < 3500) await sleep(remainingInWindow + 50);

    const post = (userId: string, content: string) =>
      request(app)
        .post(`/api/v1/channels/${channelId}/messages`)
        .set("Authorization", auth(userId))
        .send({ clientMessageId: randomUUID(), content });

    const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => post(spammer, `Tin dồn dập ${i + 1}`)));
    const statuses = burst.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]); // rateBurst = 5 tin/5 giây

    const limited = burst.find((r) => r.status === 429);
    expect(limited?.body.error.code).toBe("RATE_002");
    const retryAfter = limited?.body.error.details.retryAfterSeconds as number;
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(5);

    // Khoá theo (user, scope): người khác cùng kênh vẫn gửi được; tin bị chặn KHÔNG được ghi.
    const other = await post(bystander, "Tôi vẫn gửi được");
    expect(other.status).toBe(201);
    expect(await prisma.message.count({ where: { scopeId: channelId, authorId: spammer } })).toBe(5);
  });
});
