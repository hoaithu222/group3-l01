/**
 * Integration — chặn người dùng (p1-08 README §8): BLOCK-01 (A chặn B → CẢ HAI không gửi tin 1-1; bỏ chặn → gửi lại được),
 * BLOCK-02 (B tạo nhóm/thêm A → 403 `BLOCK_003`; A thêm B được), BLOCK-03 (B nhắc A → KHÔNG có thông báo cho A),
 * BLOCK-05 (`block:updated` tới MỌI thiết bị của A, không gửi cho B), API POST/DELETE/GET /me/blocks (idempotent, `BLOCK_001`,
 * `BLOCK_004`, `meta.allIds`). Mongo memory replset + socket.io-client thật; processor `block.events` bắt qua `registerJob` giả.
 *
 * ✅ 2026-09-25 chạy xanh (`TEST_DB=memory npx jest … --runInBand`; Redis được mock nên không cần BullMQ thật). Viết theo đúng mẫu
 * `conversations-direct.test.ts` + `messages-realtime.test.ts`.
 *
 * Lưu ý mã lỗi thực tế: gửi tin DIRECT khi bị chặn trả `MSG_004` (p1-04/p1-05 đã khoá bằng CV-03), tạo DM mới trả `CONV_002` —
 * `BLOCK_002` (README) chưa dùng ở nhánh nào của p1-04/p1-05, ghi ở README p1-08 §10.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: jest.fn().mockResolvedValue(undefined),
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
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { LIMITS } from "../../../../core/constants/limits";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, connectClient, tokenFor as socketTokenFor, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../../members/members.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerConversationModule } from "../../../conversations";
import blocksRoutes from "../../blocks.routes";
import "../../blocks.jobs"; // side-effect: đăng ký processor `block.events` qua `registerJob` đã mock ở trên
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "../../../conversations/tests/integration/test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1/me/blocks", blocksRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

function getProcessor(jobName: string): Processor {
  const call = mockRegistered.find((c) => c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor ${jobName}`);
  return call[2];
}

const waitForEvent = <T>(client: ClientSocket, event: string): Promise<T> => new Promise((resolve) => client.once(event, resolve));

describe("blocks — BLOCK-01/02/03/05 + API /me/blocks", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerConversationModule();
    await prisma.$runCommandRaw({
      createIndexes: "UserBlock",
      indexes: [{ key: { blockerId: 1, blockedId: 1 }, name: "UserBlock_blockerId_blockedId_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Conversation",
      indexes: [
        { key: { directKey: 1 }, name: "Conversation_directKey_key", unique: true },
        { key: { meetingKey: 1 }, name: "Conversation_meetingKey_key", unique: true },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
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
  });

  afterEach(async () => {
    await cleanupConversationsFixtures({ conversationIds: createdConversationIds, workspaceIds: createdWorkspaceIds, userIds: createdUserIds });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "User", aggregateId: { in: createdUserIds } } });
    createdWorkspaceIds.length = 0;
    createdUserIds.length = 0;
    createdConversationIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  async function seedSharedWorkspace(owner: string, members: string[]): Promise<string> {
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm chặn test" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    for (const m of members) await addMembership(workspaceId, m, "MEMBER");
    return workspaceId;
  }

  const block = (blocker: string, userId: string) =>
    request(app).post("/api/v1/me/blocks").set("Authorization", `Bearer ${tokenFor(blocker)}`).send({ userId });

  const sendDm = (from: string, conversationId: string) =>
    request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(from)}`)
      .send({ clientMessageId: randomUUID(), content: "xin chào" });

  it("BLOCK-01: A chặn B → B gửi 1-1 bị từ chối (trung tính), A cũng không gửi được; bỏ chặn → cả hai gửi lại được", async () => {
    const a = await seedUser({ name: "A chặn" });
    const b = await seedUser({ name: "B bị chặn" });
    createdUserIds.push(a.id, b.id);
    await seedSharedWorkspace(a.id, [b.id]);
    const dm = await request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ userId: b.id });
    expect(dm.status).toBe(201);
    const conversationId = dm.body.data.id as string;
    createdConversationIds.push(conversationId);
    expect((await sendDm(b.id, conversationId)).status).toBe(201);

    expect((await block(a.id, b.id)).status).toBe(201);

    for (const sender of [b.id, a.id]) {
      const res = await sendDm(sender, conversationId);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("MSG_004"); // trung tính — không nói "bị chặn"
      expect(JSON.stringify(res.body)).not.toMatch(/chặn|block/i);
    }
    // lịch sử vẫn đọc được với cả hai
    const history = await request(app).get(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(history.status).toBe(200);

    const unblock = await request(app).delete(`/api/v1/me/blocks/${b.id}`).set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(unblock.status).toBe(200);
    expect((await sendDm(b.id, conversationId)).status).toBe(201);
    expect((await sendDm(a.id, conversationId)).status).toBe(201);
  }, 30_000);

  it("BLOCK-02: B tạo nhóm có A (A đã chặn B) → 403 BLOCK_003, không tạo gì; A tạo nhóm có B → 201; B thêm A vào nhóm có sẵn → 403 BLOCK_003", async () => {
    const a = await seedUser({ name: "A chặn nhóm" });
    const b = await seedUser({ name: "B tạo nhóm" });
    const c = await seedUser({ name: "C thành viên" });
    createdUserIds.push(a.id, b.id, c.id);
    const workspaceId = await seedSharedWorkspace(a.id, [b.id, c.id]);
    expect((await block(a.id, b.id)).status).toBe(201);

    const denied = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm của B", memberIds: [a.id, c.id] });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("BLOCK_003");
    expect(await prisma.conversation.count({ where: { workspaceId, kind: "GROUP" } })).toBe(0);

    const allowed = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm của A", memberIds: [b.id] });
    expect(allowed.status).toBe(201);
    createdConversationIds.push(allowed.body.data.id as string);

    const groupOfB = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm B-C", memberIds: [c.id] });
    expect(groupOfB.status).toBe(201);
    createdConversationIds.push(groupOfB.body.data.id as string);
    const addA = await request(app)
      .post(`/api/v1/conversations/${groupOfB.body.data.id}/members`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .send({ userIds: [a.id] });
    expect(addA.status).toBe(403);
    expect(addA.body.error.code).toBe("BLOCK_003");
  }, 30_000);

  it("BLOCK-03: B nhắc A trong nhóm (A đã chặn B) → A KHÔNG có bản ghi thông báo nào", async () => {
    const a = await seedUser({ name: "A bị nhắc" });
    const b = await seedUser({ name: "B nhắc" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedSharedWorkspace(b.id, [a.id]);
    const group = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm mention", memberIds: [a.id] });
    expect(group.status).toBe(201);
    createdConversationIds.push(group.body.data.id as string);
    expect((await block(a.id, b.id)).status).toBe(201);

    const sent = await request(app)
      .post(`/api/v1/conversations/${group.body.data.id}/messages`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .send({ clientMessageId: randomUUID(), content: "hey", mentions: [{ type: "USER", targetId: a.id }] });
    expect(sent.status).toBe(201);

    expect(await prisma.notificationRecipient.count({ where: { recipientId: a.id } })).toBe(0);
  }, 30_000);

  it("API: POST idempotent (201 rồi 200), BLOCK_001 tự chặn, 404 user lạ, BLOCK_004 quá giới hạn, GET có meta.allIds, DELETE idempotent", async () => {
    const a = await seedUser({ name: "A api" });
    const b = await seedUser({ name: "B api" });
    createdUserIds.push(a.id, b.id);

    const first = await block(a.id, b.id);
    const second = await block(a.id, b.id);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.data.blockedAt).toBe(first.body.data.blockedAt);
    expect(await prisma.userBlock.count({ where: { blockerId: a.id, blockedId: b.id } })).toBe(1);

    const self = await block(a.id, a.id);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("BLOCK_001");
    expect((await block(a.id, "f".repeat(24))).status).toBe(404);

    const list = await request(app).get("/api/v1/me/blocks").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([expect.objectContaining({ userId: b.id, name: "B api", avatarUrl: null })]);
    expect(list.body.meta.allIds).toEqual([b.id]);

    // chưa chặn người kia → DELETE vẫn 200; người bị chặn KHÔNG tự xem được ai chặn mình
    const noOp = await request(app).delete(`/api/v1/me/blocks/${a.id}`).set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(noOp.status).toBe(200);
    expect((await request(app).get("/api/v1/me/blocks").set("Authorization", `Bearer ${tokenFor(b.id)}`)).body.data).toEqual([]);

    // BLOCK_004: seed thẳng tới trần rồi chặn thêm 1 người
    const extra = Array.from({ length: LIMITS.block.max - 1 }, () => newObjectId());
    await prisma.userBlock.createMany({ data: extra.map((blockedId) => ({ blockerId: a.id, blockedId })) });
    const c = await seedUser({ name: "C vượt trần" });
    createdUserIds.push(c.id);
    const over = await block(a.id, c.id);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("BLOCK_004");
  }, 60_000);

  it("BLOCK-05: A chặn B trên thiết bị 1 → thiết bị 2 của A nhận block:updated {added}, B KHÔNG nhận gì", async () => {
    const a = await seedUser({ name: "A đa thiết bị" });
    const b = await seedUser({ name: "B không nhận" });
    createdUserIds.push(a.id, b.id);

    const phone = await connectClient(harness.port, { token: socketTokenFor(a.id, `${a.id}@e.com`), deviceId: "phone" });
    const tablet = await connectClient(harness.port, { token: socketTokenFor(a.id, `${a.id}@e.com`), deviceId: "tablet" });
    const bSocket = await connectClient(harness.port, { token: socketTokenFor(b.id, `${b.id}@e.com`), deviceId: "b-phone" });
    const bReceived = jest.fn();
    bSocket.on("block:updated", bReceived);

    const tabletEvent = waitForEvent<{ added?: string; removed?: string; v: number }>(tablet, "block:updated");
    expect((await block(a.id, b.id)).status).toBe(201);
    // relay/BullMQ thật không chạy trong Jest — chạy tay processor `block.events` với dòng outbox vừa ghi.
    const outboxRow = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "user.blocked", aggregateId: a.id } });
    await getProcessor("block.events")({ data: outboxRow.payload });

    expect(await tabletEvent).toMatchObject({ v: 1, added: b.id });
    await new Promise((r) => setTimeout(r, 200));
    expect(bReceived).not.toHaveBeenCalled();

    phone.close();
    tablet.close();
    bSocket.close();
  }, 30_000);
});
