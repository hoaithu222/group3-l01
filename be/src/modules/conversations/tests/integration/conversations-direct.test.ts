/**
 * Integration — DIRECT (Mongo memory replset, `TEST_DB=memory`): CV-01 (race
 * tạo DM đồng thời), CV-02 (eligibility NO_SHARED_WORKSPACE, DM có sẵn hết
 * chung workspace → chỉ đọc), CV-03 (chặn — `UserBlock` seed trực tiếp, p1-08
 * chưa có API tạo block thật — item 2 báo cáo tác vụ), CV-20 (double-tap gửi
 * tin đầu DM idempotent qua `clientMessageId`).
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
import { invalidateSharesActiveWorkspaceCache, resetPermissionPorts } from "../../../../core/permission";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../../members/members.routes";
import conversationsRoutes from "../../conversations.routes";
import { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerConversationModule } from "../../index";
import { buildDirectKey } from "../../services/conversation-presenter";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("conversations DIRECT — CV-01/02/03/20", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];

  beforeAll(async () => {
    bindPermissionPorts();
    registerConversationModule();
    // `MongoMemoryReplSet` KHÔNG tự áp index từ schema.prisma (không có bước
    // `prisma db push` chạy trước test) — mirror
    // `messages-send-idempotency.test.ts`: phải tự tạo unique index trước khi
    // test race dựa vào P2002 (CV-01 — 20 request đồng thời cùng `directKey`).
    await prisma.$runCommandRaw({
      createIndexes: "Conversation",
      indexes: [
        { key: { directKey: 1 }, name: "Conversation_directKey_key", unique: true },
        { key: { meetingKey: 1 }, name: "Conversation_meetingKey_key", unique: true },
      ],
    });
    // CV-20 — idempotency gửi tin (clientMessageId) dựa vào P2002 của
    // `dedupeKey`/`(scopeType,scopeId,threadKey,seq)`, mirror
    // `messages-send-idempotency.test.ts`.
    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      ],
    });
  });

  afterAll(() => {
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

  async function seedSharedWorkspace(a: string, b: string): Promise<string> {
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(a)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm DM test" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, b, "MEMBER");
    return workspaceId;
  }

  it("CV-01: 20 request POST /conversations/direct song song giữa cùng 2 người → đúng 1 Conversation, cả 2 có member row", async () => {
    const a = await seedUser({ name: "A đua DM" });
    const b = await seedUser({ name: "B đua DM" });
    createdUserIds.push(a.id, b.id);
    await seedSharedWorkspace(a.id, b.id);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ userId: b.id })
      )
    );
    for (const r of responses) expect([200, 201]).toContain(r.status);

    const ids = new Set(responses.map((r) => r.body.data.id as string));
    expect(ids.size).toBe(1);
    const conversationId = [...ids][0];
    createdConversationIds.push(conversationId);

    const directKey = buildDirectKey(a.id, b.id);
    const count = await prisma.conversation.count({ where: { directKey } });
    expect(count).toBe(1);
    const members = await prisma.conversationMember.findMany({ where: { conversationId } });
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort());
  }, 30_000);

  it("CV-02a: không chung workspace ACTIVE → POST /conversations/direct → 403 CONV_001", async () => {
    const a = await seedUser({ name: "A không chung" });
    const b = await seedUser({ name: "B không chung" });
    createdUserIds.push(a.id, b.id);

    const res = await request(app)
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ userId: b.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CONV_001");
  });

  it("CV-02b: GET /conversations/direct/:userId khi chưa có hội thoại → 404 CONV_013 kèm details.eligibility", async () => {
    const a = await seedUser({ name: "A chưa DM" });
    const b = await seedUser({ name: "B chưa DM" });
    createdUserIds.push(a.id, b.id);

    const res = await request(app).get(`/api/v1/conversations/direct/${b.id}`).set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CONV_013");
    expect(res.body.error.details.eligibility).toMatchObject({ canMessage: false, reason: "NO_SHARED_WORKSPACE" });
  });

  it("CV-02c: DM đã có, sau đó hết chung workspace → vẫn đọc được (readOnly NO_SHARED_WORKSPACE), gửi tin → MSG_004", async () => {
    const a = await seedUser({ name: "A còn workspace" });
    const b = await seedUser({ name: "B rời workspace" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedSharedWorkspace(a.id, b.id);

    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ userId: b.id });
    expect(created.status).toBe(201);
    const conversationId = created.body.data.id as string;
    createdConversationIds.push(conversationId);

    // Hết chung workspace — xoá thẳng membership (mô phỏng b rời/bị loại
    // workspace) + tự xoá cache "shares:" (CV-16 dùng đúng hook thật cho luồng
    // HTTP đầy đủ; ở đây chỉ cần điều kiện eligibility đổi, không cần lại toàn
    // bộ hook workspace-member-removed).
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId, userId: b.id } });
    await invalidateSharesActiveWorkspaceCache(a.id, b.id);

    const detail = await request(app).get(`/api/v1/conversations/${conversationId}`).set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.readOnly).toBe(true);
    expect(detail.body.data.readOnlyReason).toBe("NO_SHARED_WORKSPACE");
    expect(detail.body.data.myPermissions.canSend).toBe(false);

    const sendAttempt = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Không gửi được nữa" });
    expect(sendAttempt.status).toBe(403);
    expect(sendAttempt.body.error.code).toBe("MSG_004");
  });

  it("CV-03: A chặn B (UserBlock seed trực tiếp) → B không tạo/gửi được DM (CONV_002); DM đã có → readOnly BLOCKED", async () => {
    const a = await seedUser({ name: "A chặn" });
    const b = await seedUser({ name: "B bị chặn" });
    createdUserIds.push(a.id, b.id);
    await seedSharedWorkspace(a.id, b.id);

    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ userId: b.id });
    expect(created.status).toBe(201);
    const conversationId = created.body.data.id as string;
    createdConversationIds.push(conversationId);

    await prisma.userBlock.create({ data: { blockerId: a.id, blockedId: b.id } });

    // DM đã tồn tại — B vẫn ĐỌC được lịch sử (canRead bỏ qua eligibility) nhưng readOnly BLOCKED.
    const detailForB = await request(app).get(`/api/v1/conversations/${conversationId}`).set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(detailForB.status).toBe(200);
    expect(detailForB.body.data.readOnly).toBe(true);
    expect(detailForB.body.data.readOnlyReason).toBe("BLOCKED");

    const sendAttempt = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Bị chặn rồi" });
    expect(sendAttempt.status).toBe(403);
    expect(sendAttempt.body.error.code).toBe("MSG_004");

    // Người thứ 3 (chưa từng DM, đã bị chặn) → tạo DM mới → CONV_002.
    const c = await seedUser({ name: "C thử tạo DM" });
    createdUserIds.push(c.id);
    await seedSharedWorkspace(a.id, c.id);
    await prisma.userBlock.create({ data: { blockerId: a.id, blockedId: c.id } });
    const denied = await request(app)
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${tokenFor(c.id)}`)
      .send({ userId: a.id });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CONV_002");
  });

  it("CV-20: bấm gửi 2 lần (double-tap) DM đầu tiên khi mạng chậm → 1 hội thoại, 1 tin (idempotent theo clientMessageId)", async () => {
    const a = await seedUser({ name: "A double tap" });
    const b = await seedUser({ name: "B double tap" });
    createdUserIds.push(a.id, b.id);
    await seedSharedWorkspace(a.id, b.id);

    const [c1, c2] = await Promise.all([
      request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ userId: b.id }),
      request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ userId: b.id }),
    ]);
    expect([200, 201]).toContain(c1.status);
    expect([200, 201]).toContain(c2.status);
    expect(c1.body.data.id).toBe(c2.body.data.id);
    const conversationId = c1.body.data.id as string;
    createdConversationIds.push(conversationId);

    const clientMessageId = randomUUID();
    const [m1, m2] = await Promise.all([
      request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(a.id)}`)
        .send({ clientMessageId, content: "Tin đầu tiên, bấm 2 lần" }),
      request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(a.id)}`)
        .send({ clientMessageId, content: "Tin đầu tiên, bấm 2 lần" }),
    ]);
    const statuses = [m1.status, m2.status].sort();
    expect(statuses).toEqual([200, 201]);
    expect(m1.body.data.id).toBe(m2.body.data.id);

    const count = await prisma.message.count({ where: { scopeId: conversationId, clientMessageId } });
    expect(count).toBe(1);
  }, 20_000);
});
