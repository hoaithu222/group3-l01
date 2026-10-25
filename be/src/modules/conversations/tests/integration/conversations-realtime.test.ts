/**
 * Integration — socket thật (2 `socket.io-client`, mirror
 * `channels-realtime.test.ts` p1-03): CV-09 (2 thiết bị của người bị xoá nhận
 * `conversation:removed` + bị đá khỏi `conv:{id}` ≤ 2s), CV-18 (người vừa bị
 * xoá KHÔNG nhận `conversation:activity` của tin sau đó — `emitActivity` gửi
 * tới room `user:{id}` nên phụ thuộc `ConversationMember.status` ACTIVE, KHÔNG
 * phụ thuộc còn trong room `conv:{id}` hay không), `conversation:member-updated`
 * tới máy thứ 2 CÙNG người sau khi đổi cài đặt cá nhân (mute/pin/archive qua
 * `PATCH .../me`).
 *
 * `read:receipt` khi `privacy.readReceipts=false` — SKIP có chủ đích:
 * `emitReadReceipt()` (`services/read-receipt.service.ts`) chưa có BẤT KỲ nơi
 * gọi nào trong codebase (xác nhận bằng grep) — phần GHI read marker
 * (`ConversationMember.lastReadSeq`) là việc của p1-07 (README §5 "+ `POST
 * /read-markers` ở p1-07"), CHƯA build. Không có đường nào trong hệ thống
 * hiện tại phát ra `read:receipt` để test — fabricate 1 lệnh gọi trực tiếp
 * hàm nội bộ sẽ không kiểm được hành vi THẬT (route/luồng không tồn tại).
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
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
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
import type { Job } from "bullmq";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { ROOM } from "../../../../infrastructure/socket";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import conversationsRoutes from "../../conversations.routes";
import { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerConversationModule } from "../../index";
// Side-effect: đăng ký processor `message.events`/`conversation.events` qua
// `registerJob` đã bị mock (capture vào mockRegistered) — 2 file này thường
// chỉ được `import()` động bởi `register-jobs.ts` lúc worker khởi động, KHÔNG
// tự chạy khi chỉ mount routes trong test.
import "../../../messages/events/message.outbox-handlers";
import "../../events/conversation.outbox-handlers";
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

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("conversations realtime (socket thật) — CV-09/18, member-updated 2 thiết bị", () => {
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
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    mockEnqueue.mockClear();
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

  async function seedWorkspace(ownerId: string): Promise<string> {
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm realtime CV" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return workspaceId;
  }

  it("CV-09 + CV-18: 2 thiết bị của người bị xoá nhận conversation:removed + bị đá khỏi room ≤2s; sau đó KHÔNG nhận conversation:activity nữa", async () => {
    const owner = await seedUser({ name: "Owner realtime" });
    const target = await seedUser({ name: "Target bị xoá" });
    createdUserIds.push(owner.id, target.id);
    const workspaceId = await seedWorkspace(owner.id);
    await addMembership(workspaceId, target.id, "MEMBER");

    const group = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm CV-09/18", memberIds: [target.id] });
    expect(group.status).toBe(201);
    const conversationId = group.body.data.id as string;
    createdConversationIds.push(conversationId);

    const device1 = await connectClient(harness.port, { token: socketTokenFor(target.id, `${target.id}@e.com`), deviceId: "dev-1" });
    const device2 = await connectClient(harness.port, { token: socketTokenFor(target.id, `${target.id}@e.com`), deviceId: "dev-2" });

    const joinAck1 = await emitWithAck<{ ok: boolean }>(device1, "room:join", { kind: "conv", id: conversationId });
    const joinAck2 = await emitWithAck<{ ok: boolean }>(device2, "room:join", { kind: "conv", id: conversationId });
    expect(joinAck1).toEqual({ ok: true });
    expect(joinAck2).toEqual({ ok: true });

    const removed1 = waitForEvent<Record<string, unknown>>(device1, "conversation:removed");
    const removed2 = waitForEvent<Record<string, unknown>>(device2, "conversation:removed");

    const startedAt = Date.now();
    const removeRes = await request(app)
      .delete(`/api/v1/conversations/${conversationId}/members/${target.id}`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(removeRes.status).toBe(200);

    const [payload1, payload2] = await Promise.all([removed1, removed2]);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThanOrEqual(2000);
    for (const payload of [payload1, payload2]) {
      expect(payload).toMatchObject({ conversationId, reason: "REMOVED" });
    }

    // Đá khỏi room `conv:{id}` — không còn socket nào của target trong room.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const socketsStillInRoom = await harness.io.in(ROOM.conversation(conversationId)).fetchSockets();
    expect(socketsStillInRoom).toHaveLength(0);

    // CV-18 — owner gửi tin MỚI, kích `emitActivity()` qua processor
    // `message.events` (gọi tay, thay outbox relay/BullMQ thật). Target đã
    // `status: REMOVED` → `listActiveMemberIds()` KHÔNG còn chứa target →
    // `conversation:activity` (gửi tới room `user:{id}`, không phụ thuộc
    // `conv:{id}`) không tới máy nào của target nữa.
    let device1GotActivity = false;
    let device2GotActivity = false;
    device1.on("conversation:activity", () => {
      device1GotActivity = true;
    });
    device2.on("conversation:activity", () => {
      device2GotActivity = true;
    });

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Tin sau khi target đã bị xoá" });
    expect(sendRes.status).toBe(201);
    const messageId = sendRes.body.data.id as string;

    const messageEventsProcessor = getProcessor("notifications", "message.events");
    await messageEventsProcessor({ data: { event: "created", messageId } } as Job);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(device1GotActivity).toBe(false);
    expect(device2GotActivity).toBe(false);

    device1.disconnect();
    device2.disconnect();
  }, 20_000);

  it("conversation:member-updated tới CẢ 2 thiết bị của cùng 1 người sau khi đổi cài đặt cá nhân (PATCH .../me — pin)", async () => {
    const a = await seedUser({ name: "A 2 thiết bị" });
    const b = await seedUser({ name: "B cùng workspace" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");

    const dm = await request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ userId: b.id });
    expect(dm.status).toBe(201);
    const conversationId = dm.body.data.id as string;
    createdConversationIds.push(conversationId);

    const deviceA1 = await connectClient(harness.port, { token: socketTokenFor(a.id, `${a.id}@e.com`), deviceId: "a-dev-1" });
    const deviceA2 = await connectClient(harness.port, { token: socketTokenFor(a.id, `${a.id}@e.com`), deviceId: "a-dev-2" });

    const update1 = waitForEvent<Record<string, unknown>>(deviceA1, "conversation:member-updated");
    const update2 = waitForEvent<Record<string, unknown>>(deviceA2, "conversation:member-updated");

    const patchRes = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/me`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ pinned: true });
    expect(patchRes.status).toBe(200);

    const [payload1, payload2] = await Promise.all([update1, update2]);
    for (const payload of [payload1, payload2]) {
      expect(payload).toMatchObject({ conversationId, pinnedAt: expect.any(String) });
    }

    deviceA1.disconnect();
    deviceA2.disconnect();
  }, 15_000);

  // `read:receipt` khi `User.privacy.readReceipts=false` — SKIP có chủ đích:
  // `emitReadReceipt()` chưa có nơi gọi thật nào (read marker WRITE thuộc
  // p1-07, chưa build) — không có đường thật để kích sự kiện này qua HTTP/socket.
  it.skip("read:receipt không phát khi privacy.readReceipts=false — chờ p1-07 (read marker WRITE endpoint) build xong mới có đường kích hoạt thật", () => {
    // Cố tình để trống — xem comment đầu file + docstring `read-receipt.service.ts`.
  });
});
