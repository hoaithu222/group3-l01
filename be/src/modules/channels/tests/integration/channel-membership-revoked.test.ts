/**
 * Integration — PR-06 (be.md README §8): manager cuối của 1 kênh riêng tư bị
 * loại khỏi WORKSPACE → `membership-lifecycle.service.ts#revokeInTx()` (module
 * `members`) ghi outbox `channel.membership-revoked` (be.md §5.7) CẠNH outbox
 * `membership.revoked` gốc, trong CÙNG transaction → consumer của `channels`
 * (`jobs/membership-revoked.consumer.ts`) xoá `ChannelGrant`/`ChannelMembership`
 * + enqueue `channel.orphan-check` cho kênh vừa mất MANAGER cuối →
 * `jobs/channel-orphan-check.job.ts` CAS kênh sang ARCHIVED `NO_MANAGER`.
 *
 * Đi thẳng qua HTTP cho bước "loại khỏi workspace" (dùng đúng route thật của
 * `members`, để có payload outbox y hệt production) — sau đó gọi TRỰC TIẾP
 * processor 2 job trên (bắt qua `registerJob` bị mock, xem
 * `membership-revoked.consumer.test.ts` p1-02) thay vì chờ outbox relay/BullMQ
 * thật (không có Redis thật trong môi trường CI) — `outbox`/`withTransaction`/
 * `permissionService` vẫn THẬT (`jest.requireActual`), chỉ `registerJob`/
 * `enqueue` bị chặn để lấy tay processor + tránh chạm BullMQ thật.
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

const redisStore = new Map<string, unknown>();
const redisHashStore = new Map<string, Record<string, string>>();
function redisGetImpl(key: string): Promise<unknown> {
  return Promise.resolve(redisStore.has(key) ? redisStore.get(key) : null);
}
function redisSetImpl(key: string, value: unknown): Promise<void> {
  redisStore.set(key, value);
  return Promise.resolve();
}
function redisDelImpl(key: string): Promise<void> {
  redisStore.delete(key);
  return Promise.resolve();
}
function redisGetdelImpl(key: string): Promise<unknown> {
  const v = redisStore.has(key) ? redisStore.get(key) : null;
  redisStore.delete(key);
  return Promise.resolve(v);
}
function redisIncrImpl(key: string): Promise<number> {
  const next = ((redisStore.get(key) as number) ?? 0) + 1;
  redisStore.set(key, next);
  return Promise.resolve(next);
}
function redisExistsImpl(key: string): Promise<boolean> {
  return Promise.resolve(redisStore.has(key));
}
function redisSetNxImpl(key: string): Promise<boolean> {
  if (redisStore.has(key)) return Promise.resolve(false);
  redisStore.set(key, "1");
  return Promise.resolve(true);
}
function redisHsetImpl(key: string, field: string, value: string): Promise<void> {
  const h = redisHashStore.get(key) ?? {};
  h[field] = value;
  redisHashStore.set(key, h);
  return Promise.resolve();
}
function redisHgetallImpl(key: string): Promise<Record<string, string>> {
  return Promise.resolve({ ...(redisHashStore.get(key) ?? {}) });
}
function redisHdelImpl(key: string, field: string): Promise<void> {
  const h = redisHashStore.get(key);
  if (h) delete h[field];
  return Promise.resolve();
}

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

import express from "express";
import request from "supertest";
import type { Job } from "bullmq";
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
import channelsRoutes from "../../channels.routes";
import channelGrantsRoutes from "../../channel-grants.routes";
import membersRoutes from "../../../members/members.routes";
// Side-effect: đăng ký processor qua `registerJob` đã bị mock ở trên (capture
// vào mockRegistered) — KHÔNG mở kết nối BullMQ thật (`registerJob` thật cũng
// chỉ thêm vào Map, không tự nối Redis — xem `infrastructure/queue/worker.ts`
// — nhưng mock ở đây còn giúp ta LẤY LẠI hàm xử lý để gọi tay).
import "../../jobs/membership-revoked.consumer";
import "../../jobs/channel-orphan-check.job";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

async function seedUser(overrides: { id?: string; name?: string } = {}): Promise<{ id: string; name: string }> {
  const id = overrides.id ?? newObjectId();
  const name = overrides.name ?? "Nguyễn Văn A";
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name } });
  return { id, name };
}

async function addMembership(workspaceId: string, userId: string, role: "OWNER" | "ADMIN" | "MEMBER"): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
}

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("PR-06 — manager cuối bị loại khỏi workspace → kênh riêng tư tự ARCHIVED NO_MANAGER", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    (redis.get as jest.Mock).mockImplementation(redisGetImpl);
    (redis.set as jest.Mock).mockImplementation(redisSetImpl);
    (redis.del as jest.Mock).mockImplementation(redisDelImpl);
    (redis.getdel as jest.Mock).mockImplementation(redisGetdelImpl);
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockImplementation(redisExistsImpl);
    (redis.setNx as jest.Mock).mockImplementation(redisSetNxImpl);
    (redis.hset as jest.Mock).mockImplementation(redisHsetImpl);
    (redis.hgetall as jest.Mock).mockImplementation(redisHgetallImpl);
    (redis.hdel as jest.Mock).mockImplementation(redisHdelImpl);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockEnqueue.mockClear();
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
        await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Channel", aggregateId: { in: channelIds } } });
      }
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    redisHashStore.clear();
    mockAuditRecord.mockClear();
  });

  it("chuỗi đầy đủ: remove khỏi workspace → channel.membership-revoked dọn grant/membership → channel.orphan-check archive NO_MANAGER", async () => {
    const owner = await seedUser();
    const admin2 = await seedUser();
    const otherMember = await seedUser();
    createdUserIds.push(owner.id, admin2.id, otherMember.id);

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm PR-06" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, admin2.id, "ADMIN");
    await addMembership(workspaceId, otherMember.id, "MEMBER");

    // admin2 tạo kênh riêng tư — trở thành MANAGER duy nhất; otherMember là MEMBER
    // (còn grant sau khi admin2 bị loại — dùng để kiểm consumer chỉ xoá đúng
    // grant/membership của admin2, không đụng người khác).
    const channelRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(admin2.id)}`)
      .send({ name: "Riêng tư PR-06", visibility: "PRIVATE", initialMemberIds: [otherMember.id] });
    expect(channelRes.status).toBe(201);
    const channelId = channelRes.body.data.id as string;

    const managerCountBefore = await prisma.channelGrant.count({ where: { channelId, level: "MANAGER" } });
    expect(managerCountBefore).toBe(1);

    // owner loại admin2 khỏi WORKSPACE — kích hoạt `revokeInTx()` (members),
    // ghi 2 outbox row (membership.revoked + channel.membership-revoked).
    const removeRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members/${admin2.id}/remove`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ reason: "Không còn hoạt động trong nhóm" });
    expect(removeRes.status).toBe(200);

    const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: "channel.membership-revoked", aggregateId: `${workspaceId}:${admin2.id}` },
    });
    expect(outboxRow.payload).toMatchObject({ workspaceId, userId: admin2.id });

    // Gọi tay processor `channel.membership-revoked` (thay vì chờ outbox
    // relay/BullMQ thật) với ĐÚNG payload vừa ghi.
    const membershipRevokedProcessor = getProcessor("notifications", "channel.membership-revoked");
    await membershipRevokedProcessor({ data: { workspaceId, userId: admin2.id } } as Job);

    const grantAfter = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: admin2.id, source: "DIRECT" } },
    });
    expect(grantAfter).toBeNull();
    const membershipAfter = await prisma.channelMembership.findUnique({
      where: { channelId_userId: { channelId, userId: admin2.id } },
    });
    expect(membershipAfter).toBeNull();

    // otherMember KHÔNG bị đụng tới.
    const otherGrant = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: otherMember.id, source: "DIRECT" } },
    });
    expect(otherGrant).not.toBeNull();

    // Kênh đã hết MANAGER → phải enqueue channel.orphan-check.
    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "channel.orphan-check",
      { channelId },
      expect.objectContaining({ jobId: `channel.orphan-check:channel:${channelId}` })
    );

    // Kênh vẫn ACTIVE cho tới khi orphan-check thật sự chạy.
    const stillActive = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    expect(stillActive.status).toBe("ACTIVE");

    // Gọi tay processor `channel.orphan-check`.
    const orphanCheckProcessor = getProcessor("cron", "channel.orphan-check");
    await orphanCheckProcessor({ data: { channelId } } as Job);

    const archived = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archiveReason).toBe("NO_MANAGER");

    // Idempotent — gọi lại lần 2 không lỗi, không đổi gì thêm.
    await expect(orphanCheckProcessor({ data: { channelId } } as Job)).resolves.toBeUndefined();
    const archivedAgain = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    expect(archivedAgain.archiveReason).toBe("NO_MANAGER");
  }, 30_000);

  it("còn manager khác (không phải cuối) bị loại khỏi workspace → vẫn enqueue orphan-check (be.md §5.7: cho MỌI kênh user từng là MANAGER) nhưng orphanCheck() không archive vì còn manager khác", async () => {
    const owner = await seedUser();
    const admin2 = await seedUser();
    const admin3 = await seedUser();
    createdUserIds.push(owner.id, admin2.id, admin3.id);

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm PR-06 còn manager khác" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await addMembership(workspaceId, admin2.id, "ADMIN");
    await addMembership(workspaceId, admin3.id, "ADMIN");

    const channelRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(admin2.id)}`)
      .send({ name: "Riêng tư 2 manager", visibility: "PRIVATE" });
    const channelId = channelRes.body.data.id as string;

    // admin3 trở thành MANAGER thứ 2 (grant trực tiếp qua route grants).
    const grantAddRes = await request(app)
      .post(`/api/v1/channels/${channelId}/grants`)
      .set("Authorization", `Bearer ${tokenFor(admin2.id)}`)
      .send({ userIds: [admin3.id], level: "MANAGER" });
    expect(grantAddRes.status).toBe(201);
    expect(grantAddRes.body.data.added).toEqual([admin3.id]);
    const grantCheck = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: admin3.id, source: "DIRECT" } },
    });
    expect(grantCheck?.level).toBe("MANAGER");

    const removeRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members/${admin2.id}/remove`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ reason: "Không còn hoạt động trong nhóm" });
    expect(removeRes.status).toBe(200);

    const membershipRevokedProcessor = getProcessor("notifications", "channel.membership-revoked");
    await membershipRevokedProcessor({ data: { workspaceId, userId: admin2.id } } as Job);

    // be.md §5.7: consumer enqueue `channel.orphan-check` cho MỌI kênh mà
    // user vừa mất chức MANAGER — không tự tính managerCount trong transaction
    // đang xoá (tránh race); quyết định archive hay không CAS lại trong chính
    // `orphanCheck()` (idempotent, xem `channel-orphan-check.job.ts`).
    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "channel.orphan-check",
      { channelId },
      expect.objectContaining({ jobId: `channel.orphan-check:channel:${channelId}` })
    );

    const orphanCheckProcessor = getProcessor("cron", "channel.orphan-check");
    const archivedNow = await orphanCheckProcessor({ data: { channelId } } as Job);
    expect(archivedNow).toBeUndefined(); // job không throw; `orphanCheck()` trả false nội bộ, không lưu trữ

    const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    expect(channel.status).toBe("ACTIVE"); // còn admin3 là MANAGER → KHÔNG archive
    const remainingManager = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: admin3.id, source: "DIRECT" } },
    });
    expect(remainingManager?.level).toBe("MANAGER");
  }, 30_000);
});
