/**
 * Integration — item 5 báo cáo tác vụ p1-05 (cross-module với `messages`):
 * `getOrCreateDirect` (`ConversationHooks`) giờ THẬT, wired vào
 * `message-forward.service.ts` — chuyển tiếp tin CHANNEL tới
 * `{directUserId}` giờ tạo/tái dùng hội thoại DIRECT thật (`SENT`) thay vì
 * luôn `MSG_017` (mã đó giờ CHỈ còn là fallback khi `ConversationHooks` CHƯA
 * đăng ký — case đó đã test riêng ở `messages.routes.test.ts` p1-04, file đó
 * KHÔNG gọi `registerConversationModule()` nên registry rỗng, hành vi cũ vẫn
 * đúng — không cần sửa gì ở đó, xem phân tích trong báo cáo cuối tác vụ).
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
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../../messages/messages.routes";
import conversationsRoutes from "../../conversations.routes";
import { registerConversationModule } from "../../index";
import { buildDirectKey } from "../../services/conversation-presenter";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("forward CHANNEL → directUserId (cross-module messages↔conversations, item 5 báo cáo)", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
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
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
        await prisma.message.deleteMany({ where: { scopeType: "CHANNEL", scopeId: { in: channelIds } } });
        await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Channel", aggregateId: { in: channelIds } } });
      }
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
    }
    await cleanupConversationsFixtures({
      conversationIds: createdConversationIds,
      workspaceIds: createdWorkspaceIds,
      userIds: createdUserIds,
    });
    createdWorkspaceIds.length = 0;
    createdUserIds.length = 0;
    createdConversationIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  it("chung workspace ACTIVE → forward directUserId trả SENT, tạo hội thoại DIRECT thật với forwardedFrom đúng", async () => {
    const owner = await seedUser({ name: "Owner forward" });
    const target = await seedUser({ name: "Target forward cùng workspace" });
    createdUserIds.push(owner.id, target.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm forward CV" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, target.id, "MEMBER");

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh nguồn forward", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    const channelId = ch.body.data.id as string;

    const source = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Tin sẽ forward sang DM" });
    expect(source.status).toBe(201);
    const sourceId = source.body.data.id as string;

    const forwardRequestId = randomUUID();
    const fwd = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ forwardRequestId, targets: [{ directUserId: target.id }] });
    expect(fwd.status).toBe(200);
    expect(fwd.body.data.results[0]).toMatchObject({ status: "SENT", scopeType: "CONVERSATION" });

    const conversationId = fwd.body.data.results[0].scopeId as string;
    expect(conversationId).toBeTruthy();
    createdConversationIds.push(conversationId);

    const directKey = buildDirectKey(owner.id, target.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { directKey } });
    expect(conv.id).toBe(conversationId);
    expect(conv.kind).toBe("DIRECT");

    const forwardedMsg = await prisma.message.findUniqueOrThrow({ where: { id: fwd.body.data.results[0].messageId as string } });
    expect(forwardedMsg.forwardedFrom).toMatchObject({ messageId: sourceId, authorId: owner.id, scopeType: "CHANNEL" });

    // Gửi lại forward LẦN 2 tới cùng đích, cùng forwardRequestId — idempotent, KHÔNG tạo thêm hội thoại/tin.
    const fwd2 = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ forwardRequestId, targets: [{ directUserId: target.id }] });
    expect(fwd2.status).toBe(200);
    expect(fwd2.body.data.results[0].messageId).toBe(fwd.body.data.results[0].messageId);
    const convCount = await prisma.conversation.count({ where: { directKey } });
    expect(convCount).toBe(1);
  }, 20_000);

  it("KHÔNG chung workspace (eligibility NO_SHARED_WORKSPACE) → forward directUserId trả DENIED với mã eligibility THẬT, không phải MSG_017 fallback", async () => {
    const owner = await seedUser({ name: "Owner forward cô lập" });
    const outsider = await seedUser({ name: "Người ngoài, không chung workspace" });
    createdUserIds.push(owner.id, outsider.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm forward cô lập" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh nguồn cô lập", visibility: "PUBLIC" });
    const channelId = ch.body.data.id as string;

    const source = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Tin sẽ forward nhưng bị từ chối" });
    const sourceId = source.body.data.id as string;

    const fwd = await request(app)
      .post(`/api/v1/messages/${sourceId}/forward`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ forwardRequestId: randomUUID(), targets: [{ directUserId: outsider.id }] });
    expect(fwd.status).toBe(200);
    expect(fwd.body.data.results[0].status).toBe("DENIED");
    expect(fwd.body.data.results[0].code).toBe("CONV_001");
    expect(fwd.body.data.results[0].code).not.toBe("MSG_017");

    const directKey = buildDirectKey(owner.id, outsider.id);
    const conv = await prisma.conversation.findUnique({ where: { directKey } });
    expect(conv).toBeNull();
  });
});
