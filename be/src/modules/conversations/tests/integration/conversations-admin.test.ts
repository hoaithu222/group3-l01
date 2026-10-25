/**
 * Integration — `admin-conversations` (Mongo memory replset): CV-21 (admin
 * nền tảng chỉ thấy SỐ LIỆU — trường `title` phải THỰC SỰ VẮNG MẶT khỏi JSON,
 * không chỉ "không hiển thị trên UI giả định") + giải tán nền tảng qua báo cáo.
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
import conversationsRoutes from "../../conversations.routes";
import adminConversationsRoutes from "../../../admin-conversations/admin-conversations.routes";
import { registerConversationModule } from "../../index";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", adminConversationsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("admin-conversations — CV-21 + giải tán nền tảng", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
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

  it("CV-21: GET /admin/workspaces/:id/conversations — mỗi dòng KHÔNG có field `title` (vắng mặt thật khỏi JSON), chỉ số liệu", async () => {
    const owner = await seedUser({ name: "Owner admin CV-21" });
    const member = await seedUser({ name: "Member admin CV-21" });
    const admin = await seedUser({ name: "Admin nền tảng" });
    createdUserIds.push(owner.id, member.id, admin.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm CV-21" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, member.id, "MEMBER");

    const secretTitle = "Tên nhóm rất riêng tư — không được lộ cho admin";
    const group = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: secretTitle, memberIds: [member.id] });
    expect(group.status).toBe(201);
    createdConversationIds.push(group.body.data.id as string);

    const adminList = await request(app)
      .get(`/api/v1/admin/workspaces/${workspaceId}/conversations`)
      .set("Authorization", `Bearer ${tokenFor(admin.id, "admin")}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.data.length).toBeGreaterThan(0);

    const raw = JSON.stringify(adminList.body);
    expect(raw).not.toContain(secretTitle);
    for (const row of adminList.body.data.data as Record<string, unknown>[]) {
      expect(Object.prototype.hasOwnProperty.call(row, "title")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(row, "ownerName")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(row, "memberCount")).toBe(true);
    }
    expect(adminList.body.data.stats).toMatchObject({ groups: expect.any(Number), activeGroups7d: expect.any(Number) });
  });

  it("giải tán nền tảng qua báo cáo (moderation:update) — thành công, có lý do + audit", async () => {
    const owner = await seedUser({ name: "Owner giải tán nền tảng" });
    const admin = await seedUser({ name: "Admin giải tán" });
    createdUserIds.push(owner.id, admin.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm giải tán nền tảng" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const otherMember = await seedUser({ name: "Thành viên khác" });
    createdUserIds.push(otherMember.id);
    await addMembership(workspaceId, otherMember.id, "MEMBER");
    const groupRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm vi phạm thật", memberIds: [otherMember.id] });
    expect(groupRes.status).toBe(201);
    const conversationId = groupRes.body.data.id as string;
    createdConversationIds.push(conversationId);

    const dissolve = await request(app)
      .post(`/api/v1/admin/conversations/${conversationId}/dissolve`)
      .set("Authorization", `Bearer ${tokenFor(admin.id, "admin")}`)
      .send({ reason: "Vi phạm quy tắc cộng đồng nghiêm trọng", reportId: newObjectId() });
    expect(dissolve.status).toBe(200);
    expect(dissolve.body.data).toMatchObject({ id: conversationId, status: "DISSOLVED" });

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.status).toBe("DISSOLVED");
    expect(conv.dissolveReason).toBe("PLATFORM");
    expect(conv.dissolvedBy).toBe(admin.id);

    const systemMsg = await prisma.message.findFirst({ where: { scopeId: conversationId, systemType: "CONVERSATION_DISSOLVED" } });
    expect(systemMsg?.systemPayload).toMatchObject({ byPlatform: true });
  });

  it("thiếu quyền moderation:update → 403 khi user thường thử giải tán nền tảng", async () => {
    const owner = await seedUser({ name: "Owner thiếu quyền" });
    const other = await seedUser({ name: "Thành viên khác — no quyền" });
    createdUserIds.push(owner.id, other.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm thiếu quyền" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, other.id, "MEMBER");
    const groupRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm bình thường", memberIds: [other.id] });
    const conversationId = groupRes.body.data.id as string;
    createdConversationIds.push(conversationId);

    const denied = await request(app)
      .post(`/api/v1/admin/conversations/${conversationId}/dissolve`)
      .set("Authorization", `Bearer ${tokenFor(owner.id, "user")}`)
      .send({ reason: "Không có quyền thật sự", reportId: newObjectId() });
    expect(denied.status).toBe(403);
  });
});
