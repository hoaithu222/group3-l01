/**
 * Integration — nối hook p1-05 `ConversationHooks.onWorkspaceArchived/Restored`
 * (be.md §5.9) từ `modules/workspaces`: archive/restore workspace ghi thêm 1 dòng
 * outbox RIÊNG (`conversations.workspace-archived|restored`) trong CÙNG
 * transaction — cùng cách `conversations.workspace-member-removed`; processor
 * (`jobs/workspace-status.job.ts`, bắt qua `registerJob` đã mock — không cần
 * Redis/BullMQ thật) chuyển GROUP ACTIVE ↔ ARCHIVED, không bao giờ mở lại DISSOLVED.
 * Mirror `conversations-hooks.test.ts`.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
  };
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
import type { Job } from "bullmq";
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
// Side-effect: đăng ký 2 processor qua `registerJob` đã bị mock ở trên.
import "../../jobs/workspace-status.job";
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

function getProcessor(jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === "notifications" && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho notifications/${jobName}`);
  return call[2];
}

describe("conversations × workspace archive/restore — CV-16b (nối ConversationHooks.onWorkspaceArchived/Restored)", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerConversationModule();
    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Conversation",
      indexes: [
        { key: { directKey: 1 }, name: "Conversation_directKey_key", unique: true },
        { key: { meetingKey: 1 }, name: "Conversation_meetingKey_key", unique: true },
      ],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockEnqueue.mockClear();
  });

  afterEach(async () => {
    await cleanupConversationsFixtures({
      conversationIds: createdConversationIds,
      workspaceIds: createdWorkspaceIds,
      userIds: createdUserIds,
    });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Workspace", aggregateId: { in: createdWorkspaceIds } } });
    createdWorkspaceIds.length = 0;
    createdUserIds.length = 0;
    createdConversationIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  async function createGroup(creatorId: string, workspaceId: string, memberIds: string[], title: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(creatorId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title, memberIds });
    expect(res.status).toBe(201);
    createdConversationIds.push(res.body.data.id as string);
    return res.body.data.id as string;
  }

  it("archive workspace → GROUP ACTIVE thành ARCHIVED (chỉ đọc, chặn gửi); restore → ACTIVE; DISSOLVED không mở lại; job lặp vô hại", async () => {
    const owner = await seedUser({ name: "Chủ workspace CV-16b" });
    const member = await seedUser({ name: "Thành viên CV-16b" });
    createdUserIds.push(owner.id, member.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm CV-16b" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, member.id, "MEMBER");

    const activeGroup = await createGroup(owner.id, workspaceId, [member.id], "Nhóm chat còn hoạt động");
    const dissolvedGroup = await createGroup(owner.id, workspaceId, [member.id], "Nhóm chat đã giải tán");
    const dissolve = await request(app)
      .post(`/api/v1/conversations/${dissolvedGroup}/dissolve`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ confirmTitle: "Nhóm chat đã giải tán" });
    expect(dissolve.status).toBe(200);

    // ── archive ──
    const archive = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/archive`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ expectedVersion: 1 });
    expect(archive.status).toBe(200);
    const archivedVersion = archive.body.data.version as number;

    const archivedRow = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "conversation.workspace-archived", aggregateId: workspaceId } });
    expect(archivedRow).toMatchObject({ queue: "notifications", jobName: "conversations.workspace-archived" });
    expect(archivedRow.payload).toMatchObject({ workspaceId });

    // Chưa chạy job → nhóm chat CHƯA đổi (outbox chỉ ghi việc cần làm, không làm ngay).
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: activeGroup } })).status).toBe("ACTIVE");

    const onArchived = getProcessor("conversations.workspace-archived");
    await onArchived({ data: archivedRow.payload } as Job);
    await onArchived({ data: archivedRow.payload } as Job); // xử lý lặp (retry) — idempotent

    const archivedConv = await prisma.conversation.findUniqueOrThrow({ where: { id: activeGroup } });
    expect(archivedConv.status).toBe("ARCHIVED");
    expect(archivedConv.archivedAt).not.toBeNull();
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: dissolvedGroup } })).status).toBe("DISSOLVED");

    const detail = await request(app).get(`/api/v1/conversations/${activeGroup}`).set("Authorization", `Bearer ${tokenFor(member.id)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ readOnly: true, readOnlyReason: "ARCHIVED" });

    const blocked = await request(app)
      .post(`/api/v1/conversations/${activeGroup}/messages`)
      .set("Authorization", `Bearer ${tokenFor(member.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Nhắn khi workspace đã lưu trữ" });
    expect(blocked.status).toBe(403);

    // ── restore ──
    const restore = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/restore`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ expectedVersion: archivedVersion });
    expect(restore.status).toBe(200);

    const restoredRow = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "conversation.workspace-restored", aggregateId: workspaceId } });
    expect(restoredRow).toMatchObject({ jobName: "conversations.workspace-restored" });
    expect(restoredRow.dedupeKey).not.toBe(archivedRow.dedupeKey); // khoá theo version → mỗi lần đổi trạng thái 1 dòng riêng

    await getProcessor("conversations.workspace-restored")({ data: restoredRow.payload } as Job);

    const restoredConv = await prisma.conversation.findUniqueOrThrow({ where: { id: activeGroup } });
    expect(restoredConv.status).toBe("ACTIVE");
    expect(restoredConv.archivedAt).toBeNull();
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: dissolvedGroup } })).status).toBe("DISSOLVED"); // KHÔNG mở lại

    const sent = await request(app)
      .post(`/api/v1/conversations/${activeGroup}/messages`)
      .set("Authorization", `Bearer ${tokenFor(member.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Nhắn lại được sau khi khôi phục" });
    expect(sent.status).toBe(201);
  }, 40_000);
});
