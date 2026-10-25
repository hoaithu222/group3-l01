/**
 * Integration — ĐIỂM MỞ RỘNG thông báo của p1-07 (Mongo memory replset, `TEST_DB=memory`; Redis mock STATEFUL; queue/FCM giả):
 * một module Phase 3+ (vd bình luận thẻ p3-03) đăng ký loại MỚI bằng `registerNotificationType` rồi gọi `notify()` mà KHÔNG sửa
 * lõi `notifications`, và vẫn được: chặn người đã chặn người gây ra (BLOCK-03), tôn trọng tắt tiếng / chế độ chỉ-nhắc-tên
 * của hội thoại (NT-04, phân biệt MUTED ↔ MENTIONS), "đang xem" theo khoá Redis (NT-09), idempotent khi gọi lại, tự đọc khi
 * đọc tới tin (`stream`, NT-12), push mang đúng `data`/kênh Android/collapse do module khai — và jobId push không có ':'.
 * Outbox `deliver.recipient` do `notify()` ghi được đọc lại và chạy TAY qua processor (relay/BullMQ thật không chạy trong Jest).
 */
process.env.FEATURE_FLAGS = "communication=true,push=true";
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
    defineCron: jest.fn(),
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
  };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(),
    getdel: jest.fn(), incr: jest.fn(), incrBy: jest.fn(), expire: jest.fn(), exists: jest.fn(), setNx: jest.fn(),
    hset: jest.fn(), hgetall: jest.fn(), hdel: jest.fn(), scanKeys: jest.fn(), getClient: jest.fn(),
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

const mockSendMulticast = jest.fn();
jest.mock("../../../../infrastructure/push", () => {
  const actual = jest.requireActual("../../../../infrastructure/push");
  return { ...actual, getPushSender: () => ({ sendMulticast: (...args: unknown[]) => mockSendMulticast(...args) }) };
});

import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma, withTransaction } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { getBlockPort } from "../../../blocks/public";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import { notify, registerNotificationType } from "../../public";
// Side-effect: đăng ký processor qua `registerJob` đã mock ở trên.
import "../../jobs/notification.jobs";
import "../../jobs/push.jobs";
import "../../jobs/mark-read-by-stream.job";

const EXT_TYPE = "test.ext-comment";
registerNotificationType({
  type: EXT_TYPE,
  inbox: true,
  inboxFilter: "mentions",
  pushType: EXT_TYPE,
  androidChannel: "mentions",
  priority: 50,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "conversation.read",
  respectBlock: true,
  push: {
    dataKeys: ["taskId"],
    collapseKey: (refs) => `task:${String(refs["taskId"])}`,
    template: ({ refs, lockScreenPreview }) => ({
      title: "Bạn có bình luận mới trên thẻ",
      body: lockScreenPreview ? String(refs["taskTitle"]) : undefined,
    }),
  },
});

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", conversationsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const store = makeRedisStore();
jest.setTimeout(120_000);
const auth = (id: string): string => `Bearer ${tokenFor(id)}`;

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor ${queue}/${jobName}`);
  return call[2];
}

describe("notify() — điểm mở rộng cho module khác (integration)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    await prisma.$runCommandRaw({
      createIndexes: "NotificationRecipient",
      indexes: [{ key: { recipientId: 1, dedupeKey: 1 }, name: "NotificationRecipient_recipientId_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Notification",
      indexes: [{ key: { dedupeKey: 1 }, name: "Notification_dedupeKey_key", unique: true }],
    });
    await prisma.$runCommandRaw({
      createIndexes: "OutboxEvent",
      indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(async () => {
    // Mongo memory dùng CHUNG cho cả lượt chạy `--runInBand`: dòng outbox `deliver.recipient` do suite khác để lại sẽ làm lệch số đếm/giao nhầm.
    await prisma.outboxEvent.deleteMany({ where: { jobName: "deliver.recipient" } });
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (redis as unknown as { incrBy: jest.Mock }).incrBy.mockResolvedValue(1);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    mockEnqueue.mockClear();
    mockSendMulticast.mockReset().mockResolvedValue({ successCount: 1, invalidTokens: [] });
  });

  afterEach(async () => {
    await prisma.notificationRecipient.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { workspaceId: { in: workspaceIds } }] } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: { in: ["Conversation", "NotificationRecipient"] } }] } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
    await prisma.message.deleteMany({ where: { scopeId: { in: conversationIds } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    workspaceIds.length = 0;
    userIds.length = 0;
    conversationIds.length = 0;
    store.clear();
  });

  async function newUser(name: string): Promise<{ id: string; name: string }> {
    const u = await seedUser({ name });
    userIds.push(u.id);
    return u;
  }

  async function setupGroup(memberNames: string[]) {
    const a = await newUser("A người gây ra");
    const members: { id: string; name: string }[] = [];
    for (const n of memberNames) members.push(await newUser(n));
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(a.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: `Nhóm ${randomUUID().slice(0, 6)}` });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const m of members) await addMembership(workspaceId, m.id, "MEMBER");
    const conv = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", auth(a.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm đồ án", memberIds: members.map((m) => m.id) });
    expect(conv.status).toBe(201);
    const convId = conv.body.data.id as string;
    conversationIds.push(convId);
    for (const m of members) {
      await prisma.deviceToken.create({
        data: { userId: m.id, deviceId: `dev-${m.id}`, platform: "ANDROID", kind: "FCM", token: `fcm-${m.id}`, revokedAt: null, revokeReason: null, failureCount: 0 },
      });
    }
    return { a, members, workspaceId, convId };
  }

  const call = (
    a: string, workspaceId: string, convId: string, recipients: { userId: string; kind: string }[], suffix: string, seq: number
  ) =>
    withTransaction((tx) =>
      notify(tx, {
        type: EXT_TYPE,
        actorId: a,
        scope: { type: "CONVERSATION", id: convId },
        workspaceId,
        source: { type: "TaskComment", id: `task:1:comment:${suffix}` },
        refs: { taskId: "t1", taskTitle: "Đề cương chương 2" },
        recipients,
        dedupeKey: `ext-comment:${suffix}`,
        stream: { key: "root", seq },
      })
    );

  /** Chạy processor `deliver.recipient` cho các dòng outbox (chỉ dòng tạo SAU `since` nếu có). */
  async function deliverAll(since?: Date): Promise<void> {
    const rows = await prisma.outboxEvent.findMany({
      where: { jobName: "deliver.recipient", ...(since && { createdAt: { gt: since } }) },
      orderBy: { createdAt: "asc" },
    });
    for (const row of rows) await getProcessor("notifications", "deliver.recipient")({ data: row.payload });
  }

  const rowOf = (recipientId: string, suffix: string) =>
    prisma.notificationRecipient.findFirst({ where: { recipientId, dedupeKey: `task:1:comment:${suffix}` } });

  it("MUTED ≠ mention-only ≠ chặn ≠ đang xem; idempotent; jobId không ':'; push mang data/kênh/collapse của module", async () => {
    const { a, members, workspaceId, convId } = await setupGroup(["B tắt tiếng", "C đã chặn A", "D bình thường", "E chỉ nhắc tên", "F đang xem"]);
    const [b, c, d, e, f] = members as [typeof members[0], typeof members[0], typeof members[0], typeof members[0], typeof members[0]];

    await prisma.conversationMember.updateMany({ where: { conversationId: convId, userId: b.id }, data: { notifyMode: "MUTED" } });
    await prisma.conversationMember.updateMany({ where: { conversationId: convId, userId: e.id }, data: { notifyMode: "MENTIONS" } });
    await prisma.userBlock.create({ data: { blockerId: c.id, blockedId: a.id } });
    await getBlockPort().invalidate([a.id, c.id]); // block seed thẳng DB → xoá cache `blockedBy:*`
    store.redisStore.set(`viewing:${f.id}:CONVERSATION:${convId}`, "1");

    // 1) Bình luận thường (kind KHÔNG phải nhắc tên) tới cả 5 người.
    const everyone = members.map((m) => ({ userId: m.id, kind: "TASK_COMMENT" }));
    await call(a.id, workspaceId, convId, everyone, "1", 3);

    // C đã chặn A → KHÔNG có mục, KHÔNG có dòng outbox giao (BLOCK-03); 4 người còn lại có mục.
    expect(await rowOf(c.id, "1")).toBeNull();
    for (const u of [b, d, e, f]) expect(await rowOf(u.id, "1")).not.toBeNull();
    expect(await prisma.outboxEvent.count({ where: { jobName: "deliver.recipient" } })).toBe(4);

    // 2) IDEMPOTENT: gọi lại y hệt → không lỗi (trước đây P2002 trên outbox `deliver:*` huỷ transaction), không thêm dòng.
    await expect(call(a.id, workspaceId, convId, everyone, "1", 3)).resolves.toBeDefined();
    expect(await prisma.outboxEvent.count({ where: { jobName: "deliver.recipient" } })).toBe(4);
    expect(await prisma.notificationRecipient.count({ where: { dedupeKey: "task:1:comment:1" } })).toBe(4);

    // 3) Giao (engine `deliver.recipient` thật): quyết định push khác nhau theo TỪNG lý do.
    await deliverAll();
    expect(await rowOf(b.id, "1")).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MUTED", inInbox: true }); // tắt tiếng: có mục, không push
    expect(await rowOf(e.id, "1")).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MODE", inInbox: true }); // chỉ-nhắc-tên: bình luận thường không push
    expect(await rowOf(f.id, "1")).toMatchObject({ pushStatus: "SKIPPED", skipReason: "VIEWING", inInbox: true }); // đang xem đúng hội thoại
    const dRow = await rowOf(d.id, "1");
    expect(dRow).toMatchObject({ pushStatus: "PENDING", inInbox: true });

    // jobId push KHÔNG chứa ':' (BullMQ ném "Custom Id cannot contain :" cho jobId có ':' không đúng 3 đoạn).
    const pushCalls = mockEnqueue.mock.calls.filter((cl) => cl[0] === "push");
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]?.[1]).toBe("push.send");
    expect((pushCalls[0]?.[3] as { jobId: string }).jobId).toBe(`push.send_${dRow?.id}`);
    expect((pushCalls[0]?.[3] as { jobId: string }).jobId).not.toContain(":");

    // 4) Push của D dựng theo khai báo của module: data.taskId, kênh Android `mentions`, collapse riêng, nội dung TRUNG TÍNH.
    await getProcessor("push", "push.send")({ data: pushCalls[0]?.[2] });
    expect(mockSendMulticast).toHaveBeenCalledTimes(1);
    const [tokens, payload] = mockSendMulticast.mock.calls[0] as [string[], Record<string, unknown>];
    expect(tokens).toEqual([`fcm-${d.id}`]);
    expect(payload).toMatchObject({
      type: EXT_TYPE,
      targetUserId: d.id,
      androidChannel: "mentions",
      collapseKey: "task:t1",
      title: "Bạn có bình luận mới trên thẻ",
      data: { taskId: "t1" },
    });
    expect(payload["body"]).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Đề cương chương 2");
    expect(await rowOf(d.id, "1")).toMatchObject({ pushStatus: "SENT" });

    // 5) Nhắc tên (kind MENTION-loại) VƯỢT chế độ chỉ-nhắc-tên của E nhưng KHÔNG vượt tắt tiếng của B.
    mockEnqueue.mockClear();
    const since = new Date();
    await call(a.id, workspaceId, convId, [b, e].map((m) => ({ userId: m.id, kind: "TASK_COMMENT_MENTION" })), "2", 4);
    await deliverAll(since);
    expect(await rowOf(e.id, "2")).toMatchObject({ pushStatus: "PENDING" });
    expect(await rowOf(b.id, "2")).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MUTED" });
  });

  it("stream {key, seq}: đọc tới tin thì mục của loại mới tự thành đã đọc (NT-12), chỉ mục ≤ seq", async () => {
    const { a, members, workspaceId, convId } = await setupGroup(["B"]);
    const [b] = members as [typeof members[0]];
    await call(a.id, workspaceId, convId, [{ userId: b.id, kind: "TASK_COMMENT" }], "1", 3);
    await call(a.id, workspaceId, convId, [{ userId: b.id, kind: "TASK_COMMENT" }], "2", 9);

    await getProcessor("notifications", "notifications.mark-read-by-stream")({
      data: { userId: b.id, scopeType: "CONVERSATION", scopeId: convId, streamKey: "root", seq: 5 },
    });
    expect((await rowOf(b.id, "1"))?.readAt).toBeInstanceOf(Date);
    expect((await rowOf(b.id, "2"))?.readAt).toBeNull();
  });
});
