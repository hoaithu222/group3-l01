/**
 * Integration — GROUP (Mongo memory replset): CV-04 (thành viên ngoài
 * workspace/GUEST → `CONV_003`), CV-05 (bậc quyền ADMIN — be.md §5.4), CV-06
 * (OWNER rời phải chuyển chủ trước), CV-07 (thành viên cuối rời → DISSOLVED),
 * CV-08 (OWNER giải tán → còn đọc, không gửi được).
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
import conversationsRoutes from "../../conversations.routes";
import { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerConversationModule } from "../../index";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("conversations GROUP — CV-04/05/06/07/08", () => {
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

  async function seedWorkspace(ownerId: string, name = "Nhóm test conversations"): Promise<string> {
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return workspaceId;
  }

  async function createGroup(
    creatorId: string,
    workspaceId: string,
    memberIds: string[],
    title = "Nhóm CV test"
  ): Promise<{ id: string; title: string }> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(creatorId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title, memberIds });
    expect(res.status).toBe(201);
    createdConversationIds.push(res.body.data.id as string);
    return { id: res.body.data.id as string, title: res.body.data.title as string };
  }

  it("CV-04: memberIds gồm người ngoài workspace + GUEST → 400 CONV_003 với details.invalidUserIds, KHÔNG tạo gì cả (all-or-nothing)", async () => {
    const owner = await seedUser({ name: "Chủ nhóm CV-04" });
    const outsider = await seedUser({ name: "Người ngoài workspace" });
    const guest = await seedUser({ name: "Khách GUEST" });
    createdUserIds.push(owner.id, outsider.id, guest.id);
    const workspaceId = await seedWorkspace(owner.id);
    await addMembership(workspaceId, guest.id, "GUEST");

    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm CV-04", memberIds: [outsider.id, guest.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CONV_003");
    expect(res.body.error.details.invalidUserIds.sort()).toEqual([outsider.id, guest.id].sort());

    const count = await prisma.conversation.count({ where: { workspaceId, kind: "GROUP" } });
    expect(count).toBe(0);
  });

  it("CV-05: ADMIN không xoá được OWNER/ADMIN khác, không thêm-với-vai-trò-ADMIN được, không đổi vai trò được (rank rules be.md §5.4)", async () => {
    const owner = await seedUser({ name: "OWNER CV-05" });
    const admin1 = await seedUser({ name: "ADMIN 1" });
    const admin2 = await seedUser({ name: "ADMIN 2" });
    const member1 = await seedUser({ name: "MEMBER 1" });
    const newbie = await seedUser({ name: "Người mới CV-05" });
    createdUserIds.push(owner.id, admin1.id, admin2.id, member1.id, newbie.id);
    const workspaceId = await seedWorkspace(owner.id);
    for (const u of [admin1, admin2, member1, newbie]) await addMembership(workspaceId, u.id, "MEMBER");

    const group = await createGroup(owner.id, workspaceId, [admin1.id, admin2.id, member1.id]);
    await request(app)
      .patch(`/api/v1/conversations/${group.id}/members/${admin1.id}`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ role: "ADMIN" });
    await request(app)
      .patch(`/api/v1/conversations/${group.id}/members/${admin2.id}`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ role: "ADMIN" });

    // ADMIN xoá OWNER → CONV_006.
    const removeOwner = await request(app)
      .delete(`/api/v1/conversations/${group.id}/members/${owner.id}`)
      .set("Authorization", `Bearer ${tokenFor(admin1.id)}`);
    expect(removeOwner.status).toBe(403);
    expect(removeOwner.body.error.code).toBe("CONV_006");

    // ADMIN xoá ADMIN khác → CONV_006.
    const removeOtherAdmin = await request(app)
      .delete(`/api/v1/conversations/${group.id}/members/${admin2.id}`)
      .set("Authorization", `Bearer ${tokenFor(admin1.id)}`);
    expect(removeOtherAdmin.status).toBe(403);
    expect(removeOtherAdmin.body.error.code).toBe("CONV_006");

    // ADMIN xoá MEMBER thường → cho phép (xác nhận bậc vẫn hoạt động đúng chiều).
    const removeMember = await request(app)
      .delete(`/api/v1/conversations/${group.id}/members/${member1.id}`)
      .set("Authorization", `Bearer ${tokenFor(admin1.id)}`);
    expect(removeMember.status).toBe(200);

    // ADMIN thêm người mới VỚI vai trò ADMIN → CONV_006 (service-level, chỉ OWNER được).
    const addAsAdmin = await request(app)
      .post(`/api/v1/conversations/${group.id}/members`)
      .set("Authorization", `Bearer ${tokenFor(admin1.id)}`)
      .send({ userIds: [newbie.id], role: "ADMIN" });
    expect(addAsAdmin.status).toBe(403);
    expect(addAsAdmin.body.error.code).toBe("CONV_006");

    // ADMIN đổi vai trò người khác (PATCH .../members/:userId) — action
    // `conversation.member.role` chỉ OWNER có (resolver), ADMIN bị chặn ở
    // TẦNG QUYỀN trước khi tới service → 403 PERM_003 (không phải CONV_006 —
    // đây là hành vi THẬT của middleware `requireConversation`, khác cách
    // đọc "CONV_006" theo nghĩa đen của be.md §8 cho ca "nâng ai đó thành ADMIN").
    const changeRoleAsAdmin = await request(app)
      .patch(`/api/v1/conversations/${group.id}/members/${admin2.id}`)
      .set("Authorization", `Bearer ${tokenFor(admin1.id)}`)
      .send({ role: "MEMBER" });
    expect(changeRoleAsAdmin.status).toBe(403);
    expect(changeRoleAsAdmin.body.error.code).toBe("PERM_003");
  }, 20_000);

  it("CV-06: OWNER rời khi chưa chuyển chủ → CONV_005; chuyển chủ rồi rời → thành công, có tin hệ thống OWNER_TRANSFERRED + MEMBER_LEFT", async () => {
    const owner = await seedUser({ name: "OWNER CV-06" });
    const member = await seedUser({ name: "MEMBER CV-06" });
    createdUserIds.push(owner.id, member.id);
    const workspaceId = await seedWorkspace(owner.id);
    await addMembership(workspaceId, member.id, "MEMBER");
    const group = await createGroup(owner.id, workspaceId, [member.id]);

    const leaveBeforeTransfer = await request(app)
      .post(`/api/v1/conversations/${group.id}/leave`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(leaveBeforeTransfer.status).toBe(409);
    expect(leaveBeforeTransfer.body.error.code).toBe("CONV_005");

    const transfer = await request(app)
      .post(`/api/v1/conversations/${group.id}/transfer-owner`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ toUserId: member.id });
    expect(transfer.status).toBe(200);
    expect(transfer.body.data.ownerId).toBe(member.id);
    expect(transfer.body.data.myRole).toBe("ADMIN"); // người chuyển thành ADMIN

    const leaveAfterTransfer = await request(app)
      .post(`/api/v1/conversations/${group.id}/leave`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(leaveAfterTransfer.status).toBe(200);
    expect(leaveAfterTransfer.body.data).toEqual({ status: "LEFT", conversationStatus: "ACTIVE" });

    const systemTypes = (
      await prisma.message.findMany({ where: { scopeId: group.id, kind: "SYSTEM" }, select: { systemType: true } })
    ).map((m) => m.systemType);
    expect(systemTypes).toEqual(expect.arrayContaining(["OWNER_TRANSFERRED", "MEMBER_LEFT"]));

    const finalOwnerMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: group.id, userId: member.id } },
    });
    expect(finalOwnerMember?.role).toBe("OWNER");
    const formerOwnerMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: group.id, userId: owner.id } },
    });
    expect(formerOwnerMember?.status).toBe("LEFT");
  }, 20_000);

  it("CV-07: thành viên cuối cùng (OWNER một mình) rời → Conversation chuyển DISSOLVED", async () => {
    const owner = await seedUser({ name: "OWNER một mình" });
    const temp = await seedUser({ name: "Thành viên tạm — rời trước" });
    createdUserIds.push(owner.id, temp.id);
    const workspaceId = await seedWorkspace(owner.id);
    await addMembership(workspaceId, temp.id, "MEMBER");
    // `createGroupSchema.memberIds` yêu cầu tối thiểu 1 người (be.md §3 —
    // không tạo được nhóm chỉ 1 mình OWNER qua API) — cho `temp` rời trước để
    // đưa nhóm về đúng trạng thái "OWNER một mình" trước khi OWNER tự rời.
    const group = await createGroup(owner.id, workspaceId, [temp.id]);
    const tempLeave = await request(app).post(`/api/v1/conversations/${group.id}/leave`).set("Authorization", `Bearer ${tokenFor(temp.id)}`);
    expect(tempLeave.status).toBe(200);

    const leave = await request(app).post(`/api/v1/conversations/${group.id}/leave`).set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(leave.status).toBe(200);
    expect(leave.body.data).toEqual({ status: "LEFT", conversationStatus: "DISSOLVED" });

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: group.id } });
    expect(conv.status).toBe("DISSOLVED");
    expect(conv.dissolveReason).toBe("LAST_MEMBER_LEFT");
  }, 20_000);

  it("CV-08: OWNER giải tán nhóm → thành viên còn ĐỌC được (readOnly DISSOLVED) nhưng gửi tin → 403 MSG_004", async () => {
    const owner = await seedUser({ name: "OWNER giải tán" });
    const member = await seedUser({ name: "MEMBER còn lại" });
    createdUserIds.push(owner.id, member.id);
    const workspaceId = await seedWorkspace(owner.id);
    await addMembership(workspaceId, member.id, "MEMBER");
    const group = await createGroup(owner.id, workspaceId, [member.id], "Nhóm sẽ giải tán");

    const dissolve = await request(app)
      .post(`/api/v1/conversations/${group.id}/dissolve`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ confirmTitle: "Nhóm sẽ giải tán" });
    expect(dissolve.status).toBe(200);
    expect(dissolve.body.data.status).toBe("DISSOLVED");

    const detail = await request(app).get(`/api/v1/conversations/${group.id}`).set("Authorization", `Bearer ${tokenFor(member.id)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.readOnly).toBe(true);
    expect(detail.body.data.readOnlyReason).toBe("DISSOLVED");
    expect(detail.body.data.myPermissions.canSend).toBe(false);

    const sendAttempt = await request(app)
      .post(`/api/v1/conversations/${group.id}/messages`)
      .set("Authorization", `Bearer ${tokenFor(member.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Nhóm đã giải tán rồi" });
    expect(sendAttempt.status).toBe(403);
    expect(sendAttempt.body.error.code).toBe("MSG_004");

    // Vẫn còn thành viên (status KHÔNG đổi — be.md §5.5 "không đổi ConversationMember.status").
    const memberRow = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: group.id, userId: member.id } },
    });
    expect(memberRow?.status).toBe("ACTIVE");
  });
});
