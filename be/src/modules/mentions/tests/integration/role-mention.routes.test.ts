/**
 * Integration — `@role` (p3-04 be.md §5.7), Mongo memory replset (`TEST_DB=memory`), route + service + engine THẬT:
 *   - RB-10: ADMIN gửi `@Thành viên` trong kênh riêng có 5 người đọc được (1 DND, 1 là tác giả) → 4 mục hộp thư `MENTION_ROLE`
 *     (trừ tác giả), 3 push, người DND có mục hộp thư nhưng KHÔNG push (`DeliveryPolicy` thật); lần thứ 6 trong giờ → 429 `RATE_003`;
 *   - `@Quản trị viên` chỉ tới OWNER+ADMIN ∩ người đọc được kênh; MEMBER/GUEST không được `@role` (403 `PERM_006`);
 *   - tập nhận lọc `joinedAt ≤ tin.createdAt`; người đã có mục cho tin (nhắc riêng/job chạy lại) bị bỏ qua (NT-01, idempotent);
 *   - `GET /scopes/CHANNEL/:id/mentionables?includeRoles=true`.
 * Job `fanout.message-role` bắt qua `registerJob` (mock) rồi gọi tay với payload lấy từ outbox — không cần BullMQ/Redis thật.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

jest.setTimeout(90_000);

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockEnqueue = jest.fn();
const mockScheduleAt = jest.fn();
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    scheduleAt: (...args: unknown[]) => mockScheduleAt(...args),
  };
});

const redisStore = new Map<string, unknown>();
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
    lpush: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn(),
}));

const mockAuditRecord = jest.fn();
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import { randomUUID } from "crypto";
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
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../../messages/messages.routes";
import { DeliveryPolicy } from "../../../notifications/services/delivery.policy";
import { PrismaNotificationRepository } from "../../../notifications/repositories";
import mentionsRoutes from "../../mentions.routes";
import { registerMentionsModule } from "../../index";
// Side-effect: đăng ký processor `fanout.message-role` vào `mockRegistered`.
import "../../jobs/role-mention-fanout.job";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", channelsRoutes);
app.use("/api/v1/channels", channelGrantsRoutes);
app.use("/api/v1", messagesRoutes);
app.use("/api/v1", mentionsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const tokenFor = (userId: string): string =>
  JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });
const auth = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

function fanoutProcessor(): Processor {
  const call = mockRegistered.find((c) => c[1] === "fanout.message-role");
  if (!call) throw new Error("Chưa đăng ký processor fanout.message-role");
  return call[2];
}

describe("@role — RB-10 và validator/fan-out (integration)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerMentionsModule();
    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "NotificationRecipient",
      indexes: [{ key: { recipientId: 1, dedupeKey: 1 }, name: "NotificationRecipient_recipientId_dedupeKey_key", unique: true }],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    redisStore.clear();
    mockEnqueue.mockReset().mockResolvedValue(undefined);
    mockScheduleAt.mockReset().mockResolvedValue(undefined);
    (redis.get as jest.Mock).mockImplementation(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null));
    (redis.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => {
      redisStore.set(k, v);
    });
    (redis.del as jest.Mock).mockImplementation(async (k: string) => {
      redisStore.delete(k);
    });
    (redis.incr as jest.Mock).mockImplementation(async (k: string) => {
      const next = ((redisStore.get(k) as number) ?? 0) + 1;
      redisStore.set(k, next);
      return next;
    });
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockResolvedValue(false);
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    (redis.setNx as jest.Mock).mockResolvedValue(true);
    (redis.hset as jest.Mock).mockResolvedValue(undefined);
    (redis.hgetall as jest.Mock).mockResolvedValue({});
    (redis.hdel as jest.Mock).mockResolvedValue(undefined);
    (redis.lpush as jest.Mock).mockResolvedValue(1);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });

  afterEach(async () => {
    if (workspaceIds.length > 0) {
      const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
      await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: [{ aggregateType: { in: ["Channel", "Message", "Notification", "NotificationRecipient"] } }, ...workspaceIds.map((id) => ({ aggregateId: { startsWith: id } }))] },
      });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      workspaceIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  async function seedUser(name: string): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: name.toLowerCase() } });
    userIds.push(id);
    return id;
  }

  /**
   * Nhóm: owner (OWNER) · author (ADMIN) · m1, m2, dnd (MEMBER) · guest (GUEST); kênh riêng do owner tạo (owner MANAGER) và cấp cho
   * vai trò `channelRole` (mặc định MEMBER → 5 người đọc được: owner, author, m1, m2, dnd; guest KHÔNG).
   */
  async function scenario(channelRole: "ADMIN" | "MEMBER" = "MEMBER") {
    const owner = await seedUser("Chủ nhóm");
    const created = await request(app)
      .post("/api/v1/workspaces")
      .set(auth(owner))
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm @role" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);

    const people: Record<"author" | "m1" | "m2" | "dnd" | "guest", string> = {
      author: await seedUser("Người gửi"),
      m1: await seedUser("Thành viên một"),
      m2: await seedUser("Thành viên hai"),
      dnd: await seedUser("Đang DND"),
      guest: await seedUser("Khách mời"),
    };
    const roles = { author: "ADMIN", m1: "MEMBER", m2: "MEMBER", dnd: "MEMBER", guest: "GUEST" } as const;
    for (const [key, userId] of Object.entries(people)) {
      await prisma.workspaceMembership.create({
        data: { workspaceId, userId, role: roles[key as keyof typeof roles], status: "ACTIVE", joinedAt: new Date(Date.now() - 3_600_000) },
      });
    }
    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set(auth(owner))
      .send({ name: "Kênh riêng @role", visibility: "PRIVATE" });
    expect(ch.status).toBe(201);
    const channelId = ch.body.data.id as string;
    const grant = await request(app).post(`/api/v1/channels/${channelId}/grants/roles`).set(auth(owner)).send({ roleRef: channelRole });
    expect(grant.status).toBe(201);
    return { owner, workspaceId, channelId, ...people };
  }

  /** RB-10 kiểm hạn mức @role THEO GIỜ (RATE_003), không kiểm burst gửi tin (5 tin/5 giây, `rl:msg:*` → RATE_002 sẽ che nó): xoá bộ đếm burst trước mỗi lượt gửi. */
  const sendRole = (senderId: string, channelId: string, roleRef: "ADMIN" | "MEMBER", extra: { mentions?: object[]; content?: string } = {}) => {
    for (const key of [...redisStore.keys()]) if (key.startsWith("rl:msg:")) redisStore.delete(key);
    return request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set(auth(senderId))
      .send({
        clientMessageId: randomUUID(),
        content: extra.content ?? `@{r:${roleRef}} họp nhé`,
        mentions: extra.mentions ?? [{ type: "ROLE", targetId: roleRef }],
      });
  };

  /** Chạy job `fanout.message-role` bằng payload của dòng outbox do `send()` ghi cùng transaction. */
  async function runRoleFanout(messageId: string): Promise<void> {
    const row = await prisma.outboxEvent.findFirst({ where: { jobName: "fanout.message-role", aggregateId: messageId } });
    expect(row).not.toBeNull();
    await fanoutProcessor()({ data: row!.payload });
  }

  const recipientsOf = (messageId: string) => prisma.notificationRecipient.findMany({ where: { dedupeKey: `msg:${messageId}` } });

  it("RB-10: ADMIN gửi @Thành viên (kênh riêng 5 người đọc được, 1 DND, 1 là tác giả) → 4 mục MENTION_ROLE, 3 push, DND có mục hộp thư nhưng không push; lần thứ 6 → 429 RATE_003", async () => {
    const s = await scenario("MEMBER");
    await prisma.notificationPreference.create({
      data: { userId: s.dnd, scope: "ACCOUNT", scopeKey: "account", mode: "ALL", dndUntil: new Date(Date.now() + 3_600_000), lockScreenPreview: false },
    });

    const res = await sendRole(s.author, s.channelId, "MEMBER");
    expect(res.status).toBe(201);
    expect(res.body.data.mentions).toEqual([{ type: "ROLE", targetId: "MEMBER", label: "Thành viên" }]);
    const messageId = res.body.data.id as string;
    await runRoleFanout(messageId);

    const rows = await recipientsOf(messageId);
    expect(rows.map((r) => r.recipientId).sort()).toEqual([s.owner, s.m1, s.m2, s.dnd].sort()); // KHÔNG có tác giả, KHÔNG có khách
    for (const row of rows) {
      expect(row).toMatchObject({ kind: "MENTION_ROLE", kindRank: 90, filterBucket: "mentions", inInbox: true, scopeType: "CHANNEL", scopeId: s.channelId });
    }

    // Giao thật qua DeliveryPolicy (DND/quyền/thiết bị) cho từng người nhận.
    const policy = new DeliveryPolicy(new PrismaNotificationRepository(), { hasActiveDevice: async () => true });
    for (const row of rows) await policy.deliverRecipient(row.notificationId, row.recipientId);
    const after = await recipientsOf(messageId);
    const byUser = new Map(after.map((r) => [r.recipientId, r]));
    expect(byUser.get(s.dnd)).toMatchObject({ inInbox: true, pushStatus: "SKIPPED", skipReason: "DND" });
    for (const id of [s.owner, s.m1, s.m2]) expect(byUser.get(id)?.pushStatus).toBe("PENDING");
    // `mention.role` là loại `batchable` → push gộp cửa sổ (`scheduleAt push.send` theo user+scope); người DND KHÔNG được xếp push.
    expect(mockScheduleAt.mock.calls.filter((c) => c[1] === "push.send")).toHaveLength(3);
    expect(mockScheduleAt.mock.calls.map((c) => String(c[2]))).not.toEqual(expect.arrayContaining([expect.stringContaining(s.dnd)]));

    // Hạn mức: đã dùng 1/5 → thêm 4 lần OK, lần thứ 6 trong giờ → 429.
    for (let i = 0; i < 4; i++) expect((await sendRole(s.author, s.channelId, "MEMBER")).status).toBe(201);
    const sixth = await sendRole(s.author, s.channelId, "MEMBER");
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_003");
  });

  it("@Quản trị viên chỉ tới OWNER+ADMIN đọc được kênh (MEMBER đọc được kênh KHÔNG nhận); tin không có mention vai trò không sinh dòng outbox fan-out-role", async () => {
    const s = await scenario("MEMBER");
    const plain = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${s.channelId}/messages`)
      .set(auth(s.author))
      .send({ clientMessageId: randomUUID(), content: "chào cả nhà" });
    expect(plain.status).toBe(201);
    expect(await prisma.outboxEvent.count({ where: { jobName: "fanout.message-role", aggregateId: plain.body.data.id } })).toBe(0);

    const res = await sendRole(s.author, s.channelId, "ADMIN");
    expect(res.status).toBe(201);
    await runRoleFanout(res.body.data.id);
    expect((await recipientsOf(res.body.data.id)).map((r) => r.recipientId)).toEqual([s.owner]); // author bị loại; MEMBER không thuộc ADMIN
  });

  it("MEMBER/GUEST không được @role → 403 PERM_006 (không tiêu hạn mức); vai trò lạ → 400 VAL_001 (Zod)", async () => {
    const s = await scenario("MEMBER");
    const memberSend = await sendRole(s.m1, s.channelId, "ADMIN");
    expect(memberSend.status).toBe(403);
    expect(memberSend.body.error.code).toBe("PERM_006");
    expect(memberSend.body.error.details).toEqual({ reason: "MENTION_ROLE_FORBIDDEN" });
    expect(redisStore.get(`mention-role:${s.workspaceId}:${s.m1}`)).toBeUndefined();

    const bad = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${s.channelId}/messages`)
      .set(auth(s.author))
      .send({ clientMessageId: randomUUID(), content: "@{r:OWNER}", mentions: [{ type: "ROLE", targetId: "OWNER" }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VAL_001");
  });

  it("chỉ người đọc được kênh và vào nhóm TRƯỚC khi tin được gửi mới nhận; chạy lại job không tạo thêm; người đã có mục cho tin (nhắc riêng) bị bỏ qua", async () => {
    const s = await scenario("MEMBER");
    // late: vào nhóm SAU khi tin gửi (joinedAt tương lai) dù có vai trò MEMBER.
    const late = await seedUser("Vào muộn");
    await prisma.workspaceMembership.create({
      data: { workspaceId: s.workspaceId, userId: late, role: "MEMBER", status: "ACTIVE", joinedAt: new Date(Date.now() + 3_600_000) },
    });

    const res = await sendRole(s.author, s.channelId, "MEMBER", {
      content: `@{r:MEMBER} @{u:${s.m1}} xem giúp`,
      mentions: [{ type: "ROLE", targetId: "MEMBER" }, { type: "USER", targetId: s.m1 }],
    });
    expect(res.status).toBe(201);
    const messageId = res.body.data.id as string;
    await runRoleFanout(messageId);
    const first = (await recipientsOf(messageId)).map((r) => r.recipientId).sort();
    expect(first).toEqual([s.owner, s.m2, s.dnd].sort()); // không late, không m1 (nhắc riêng → fan-out tin nhắn lo), không author

    await runRoleFanout(messageId); // retry / sửa tin
    expect((await recipientsOf(messageId)).map((r) => r.recipientId).sort()).toEqual(first);
  });

  it("NT-01: người đã có mục MENTION (fan-out tin nhắn chạy trước) giữ nguyên kind MENTION, không bị hạ xuống MENTION_ROLE", async () => {
    const s = await scenario("MEMBER");
    const res = await sendRole(s.author, s.channelId, "MEMBER");
    const messageId = res.body.data.id as string;
    const notification = await prisma.notification.create({
      data: {
        type: "mention", scopeType: "CHANNEL", scopeId: s.channelId, workspaceId: s.workspaceId, actorId: s.author,
        sourceType: "MESSAGE", sourceId: messageId, refs: {}, dedupeKey: `msg:${messageId}`,
      },
    });
    await prisma.notificationRecipient.create({
      data: {
        notificationId: notification.id, recipientId: s.m2, kind: "MENTION", kindRank: 100, inInbox: true, dedupeKey: `msg:${messageId}`,
        scopeType: "CHANNEL", scopeId: s.channelId, workspaceId: s.workspaceId, readAt: null, seenAt: null, skipReason: null,
        filterBucket: "mentions", streamKey: null, streamSeq: null, cancelledAt: null,
      },
    });
    await runRoleFanout(messageId);
    const byUser = new Map((await recipientsOf(messageId)).map((r) => [r.recipientId, r]));
    expect(byUser.get(s.m2)).toMatchObject({ kind: "MENTION", kindRank: 100 });
    expect(byUser.get(s.m1)).toMatchObject({ kind: "MENTION_ROLE", kindRank: 90 });
    expect([...byUser.values()].filter((r) => r.recipientId === s.m2)).toHaveLength(1); // đúng một mục/người/tin
  });

  it("GET mentionables?includeRoles=true: OWNER/ADMIN thấy roles[] + số người nhận; MEMBER canMentionRole=false, không roles", async () => {
    const s = await scenario("MEMBER");
    const admin = await request(app).get(`/api/v1/scopes/CHANNEL/${s.channelId}/mentionables?includeRoles=true`).set(auth(s.author));
    expect(admin.status).toBe(200);
    expect(admin.body.data.canMentionRole).toBe(true);
    // Người đọc được: owner, author, m1, m2, dnd → trừ chính mình (author): ADMIN=owner (1), MEMBER=owner+m1+m2+dnd (4)
    expect(admin.body.data.roles).toEqual([
      { roleRef: "ADMIN", label: "Quản trị viên", recipientCount: 1 },
      { roleRef: "MEMBER", label: "Thành viên", recipientCount: 4 },
    ]);
    // Danh sách người vẫn gồm người đọc được nhờ vai trò (m1, m2, dnd, owner) — không có khách.
    const names = (admin.body.data.users as Array<{ userId: string }>).map((u) => u.userId);
    expect(names).toEqual(expect.arrayContaining([s.owner, s.m1, s.m2, s.dnd]));
    expect(names).not.toContain(s.guest);

    const member = await request(app).get(`/api/v1/scopes/CHANNEL/${s.channelId}/mentionables?includeRoles=true`).set(auth(s.m1));
    expect(member.body.data.canMentionRole).toBe(false);
    expect(member.body.data.roles).toBeUndefined();

    const plain = await request(app).get(`/api/v1/scopes/CHANNEL/${s.channelId}/mentionables`).set(auth(s.author));
    expect(plain.body.data.roles).toBeUndefined();
    expect(plain.body.data.canMentionRole).toBeUndefined();
  });
});
