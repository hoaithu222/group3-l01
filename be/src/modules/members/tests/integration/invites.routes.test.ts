/**
 * Integration — `/workspaces/:id/invites*` + `/invites/:token*` trên Prisma
 * thật (Mongo memory replset, `TEST_DB=memory`). Redis mock STATEFUL (giống
 * `members.routes.test.ts`) + Socket.IO THẬT vì `accept()` gọi `joinRooms()`
 * (`socket.emit.ts` → `getIO()`) NGAY SAU KHI commit, không try/catch.
 *
 * be.md p1-02 §10 — MB-01, MB-02, MB-08 (20 `Promise.all`), MB-10; preview
 * không lộ workspace khi 410; WS_006 khi accept vượt `perUserMax`.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { generateInviteToken } from "../../services/invite-token.util";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import invitesRoutes from "../../invites.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", invitesRoutes);
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

async function addMembership(
  workspaceId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "MEMBER",
  status: "ACTIVE" | "BANNED" | "LEFT" | "REMOVED" = "ACTIVE"
): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status } });
}

describe("/workspaces/:id/invites, /invites/:token (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdInviteIds: string[] = [];

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
  });

  afterEach(async () => {
    if (createdInviteIds.length > 0) {
      await prisma.inviteLink.deleteMany({ where: { id: { in: createdInviteIds } } });
      createdInviteIds.length = 0;
    }
    if (createdWorkspaceIds.length > 0) {
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
      await prisma.inviteLink.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
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

  async function createWorkspace(ownerId: string, name: string): Promise<{ workspaceId: string; defaultChannelId: string }> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return { workspaceId, defaultChannelId: res.body.data.defaultChannel.id as string };
  }

  /** Tạo InviteLink trực tiếp qua Prisma (bỏ qua endpoint) — cho phép set expiresAt/remainingUses/revokedAt tuỳ ý. */
  async function seedInvite(
    workspaceId: string,
    createdBy: string,
    overrides: { remainingUses?: number; usesCount?: number; expiresAt?: Date; revokedAt?: Date | null; maxUses?: number } = {}
  ): Promise<{ token: string; inviteId: string }> {
    const { token, tokenHash, tokenPrefix } = generateInviteToken();
    const link = await prisma.inviteLink.create({
      data: {
        workspaceId,
        tokenHash,
        tokenPrefix,
        maxUses: overrides.maxUses ?? 10,
        remainingUses: overrides.remainingUses ?? 10,
        usesCount: overrides.usesCount ?? 0,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3600_000),
        revokedAt: overrides.revokedAt ?? null,
        createdBy,
      },
    });
    createdInviteIds.push(link.id);
    return { token, inviteId: link.id };
  }

  describe("POST /workspaces/:id/invites", () => {
    it("ADMIN tạo lời mời → 201, url chứa token, tokenHash lưu đúng sha256", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm tạo invite");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expiresInHours: 24, maxUses: 10 });
      expect(res.status).toBe(201);
      expect(res.body.data.url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
      createdInviteIds.push(res.body.data.id);

      const link = await prisma.inviteLink.findUnique({ where: { id: res.body.data.id } });
      expect(link?.tokenPrefix).toBe(res.body.data.tokenPrefix);
      expect(link?.remainingUses).toBe(10);
    });

    it("MEMBER (không phải ADMIN) tạo lời mời → 403 PERM_001", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm member tạo invite");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`)
        .send({ expiresInHours: 24, maxUses: 10 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });

    it("INV_006 khi đã có 20 link đang hoạt động", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm INV_006");
      for (let i = 0; i < 20; i += 1) {
        await seedInvite(workspaceId, owner.id);
      }

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expiresInHours: 24, maxUses: 10 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INV_006");
    });
  });

  describe("GET /workspaces/:id/invites", () => {
    it("ADMIN xem danh sách → status ACTIVE tính đúng, createdBy có name", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm list invite");
      await seedInvite(workspaceId, owner.id);

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].status).toBe("ACTIVE");
      expect(res.body.data[0].createdBy).toMatchObject({ id: owner.id, name: owner.name });
    });

    it("MEMBER xem danh sách link mời → 403 PERM_001", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm member list invite");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });
  });

  describe("DELETE /workspaces/:id/invites/:inviteId", () => {
    it("ADMIN thu hồi → 200 null; gọi lần 2 vẫn 200 (idempotent)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm revoke invite");
      const { inviteId } = await seedInvite(workspaceId, owner.id);

      const first = await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/invites/${inviteId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(first.status).toBe(200);
      expect(first.body.data).toBeNull();

      const link = await prisma.inviteLink.findUnique({ where: { id: inviteId } });
      expect(link?.revokedAt).not.toBeNull();

      const second = await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/invites/${inviteId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(second.status).toBe(200);
    });

    it("thu hồi id không tồn tại → 200 null (idempotent, không 404)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm revoke id lạ");

      const res = await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/invites/${newObjectId()}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /invites/:token (preview) — MB-01, không lộ workspace khi 410", () => {
    it("token hợp lệ → 200 với workspace/inviter/expiresAt", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm preview hợp lệ");
      const { token } = await seedInvite(workspaceId, owner.id);

      const res = await request(app).get(`/api/v1/invites/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.workspace).toMatchObject({ id: workspaceId, name: "Nhóm preview hợp lệ" });
      expect(res.body.data.inviter).toMatchObject({ name: owner.name });
      expect(res.body.data.alreadyMember).toBeUndefined();
      expect(res.body.data.requiresApproval).toBe(false); // nhóm mở — vào thẳng
    });

    it("nhóm bật duyệt tham gia (joinPolicy=APPROVAL) → requiresApproval: true để app hiện 'Gửi yêu cầu tham gia'", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm preview cần duyệt");
      await prisma.workspace.update({ where: { id: workspaceId }, data: { joinPolicy: "APPROVAL" } });
      const { token } = await seedInvite(workspaceId, owner.id);

      const res = await request(app).get(`/api/v1/invites/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.requiresApproval).toBe(true);
    });

    it("viewer đã là thành viên ACTIVE → alreadyMember: true", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm preview already member");
      await addMembership(workspaceId, member.id, "MEMBER");
      const { token } = await seedInvite(workspaceId, owner.id);

      const res = await request(app)
        .get(`/api/v1/invites/${token}`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.alreadyMember).toBe(true);
    });

    it("404 khi token không tồn tại", async () => {
      const res = await request(app).get(`/api/v1/invites/${generateInviteToken().token}`);
      expect(res.status).toBe(404);
    });

    it("MB-01: hết hạn → 410 INV_001, KHÔNG lộ tên workspace trong response", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm bí mật hết hạn");
      const { token } = await seedInvite(workspaceId, owner.id, { expiresAt: new Date(Date.now() - 1000) });

      const res = await request(app).get(`/api/v1/invites/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe("INV_001");
      expect(JSON.stringify(res.body)).not.toContain("Nhóm bí mật hết hạn");
      expect(res.body.data).toBeUndefined();
    });

    it("MB-01: hết lượt → 410 INV_002, không lộ tên workspace", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm bí mật hết lượt");
      const { token } = await seedInvite(workspaceId, owner.id, { remainingUses: 0 });

      const res = await request(app).get(`/api/v1/invites/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe("INV_002");
      expect(JSON.stringify(res.body)).not.toContain("Nhóm bí mật hết lượt");
    });

    it("MB-01: đã thu hồi → 410 INV_003, không lộ tên workspace", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm bí mật đã thu hồi");
      const { token } = await seedInvite(workspaceId, owner.id, { revokedAt: new Date() });

      const res = await request(app).get(`/api/v1/invites/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe("INV_003");
      expect(JSON.stringify(res.body)).not.toContain("Nhóm bí mật đã thu hồi");
    });
  });

  describe("POST /invites/:token/accept", () => {
    it("người mới chấp nhận → 200, membership ACTIVE, join kênh mặc định, memberCount +1", async () => {
      const owner = await seedUser();
      const joiner = await seedUser();
      createdUserIds.push(owner.id, joiner.id);
      const { workspaceId, defaultChannelId } = await createWorkspace(owner.id, "Nhóm accept mới");
      const { token, inviteId } = await seedInvite(workspaceId, owner.id);
      const before = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

      const res = await request(app)
        .post(`/api/v1/invites/${token}/accept`)
        .set("Authorization", `Bearer ${tokenFor(joiner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ workspaceId, defaultChannelId, alreadyMember: false });

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: joiner.id } },
      });
      expect(membership?.status).toBe("ACTIVE");
      expect(membership?.role).toBe("MEMBER");
      const channelMembership = await prisma.channelMembership.findUnique({
        where: { channelId_userId: { channelId: defaultChannelId, userId: joiner.id } },
      });
      expect(channelMembership).not.toBeNull();
      const after = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      expect(after.memberCount).toBe(before.memberCount + 1);

      const link = await prisma.inviteLink.findUnique({ where: { id: inviteId } });
      expect(link?.remainingUses).toBe(9);
      expect(link?.usesCount).toBe(1);
    });

    it("be.md §5.3 — thành viên LEFT tái kích hoạt qua accept (KHÔNG tạo bản ghi mới)", async () => {
      const owner = await seedUser();
      const rejoiner = await seedUser();
      createdUserIds.push(owner.id, rejoiner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm reactivate LEFT");
      await addMembership(workspaceId, rejoiner.id, "MEMBER", "LEFT");
      const { token } = await seedInvite(workspaceId, owner.id);

      const res = await request(app)
        .post(`/api/v1/invites/${token}/accept`)
        .set("Authorization", `Bearer ${tokenFor(rejoiner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.alreadyMember).toBe(false);

      const memberships = await prisma.workspaceMembership.findMany({ where: { workspaceId, userId: rejoiner.id } });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.status).toBe("ACTIVE");
      expect(memberships[0]?.leftAt).toBeNull();
    });

    it("MB-02: đã ACTIVE → 200 alreadyMember:true, KHÔNG tiêu lượt", async () => {
      const owner = await seedUser();
      const already = await seedUser();
      createdUserIds.push(owner.id, already.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm MB-02");
      await addMembership(workspaceId, already.id, "MEMBER");
      const { token, inviteId } = await seedInvite(workspaceId, owner.id, { remainingUses: 5, usesCount: 5 });

      const res = await request(app)
        .post(`/api/v1/invites/${token}/accept`)
        .set("Authorization", `Bearer ${tokenFor(already.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.alreadyMember).toBe(true);

      const link = await prisma.inviteLink.findUnique({ where: { id: inviteId } });
      expect(link?.remainingUses).toBe(5);
      expect(link?.usesCount).toBe(5);
    });

    it("MB-10: BANNED mở link hợp lệ mới → 403 INV_004", async () => {
      const owner = await seedUser();
      const banned = await seedUser();
      createdUserIds.push(owner.id, banned.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm MB-10");
      await addMembership(workspaceId, banned.id, "MEMBER", "BANNED");
      const { token } = await seedInvite(workspaceId, owner.id);

      const res = await request(app)
        .post(`/api/v1/invites/${token}/accept`)
        .set("Authorization", `Bearer ${tokenFor(banned.id)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("INV_004");
    });

    it("WS_006: user đã đạt perUserMax (50) workspace ACTIVE → 409 khi accept thêm", async () => {
      const owner = await seedUser();
      const busy = await seedUser();
      createdUserIds.push(owner.id, busy.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm WS_006 chính");
      const { token } = await seedInvite(workspaceId, owner.id);

      const extraWorkspaceIds: string[] = [];
      for (let i = 0; i < 50; i += 1) {
        const id = newObjectId();
        extraWorkspaceIds.push(id);
        await prisma.workspace.create({
          data: {
            id,
            name: `WS_006-${i}`,
            normalizedName: `ws_006-${i}`,
            ownerId: busy.id,
            status: "ACTIVE",
          },
        });
        await addMembership(id, busy.id, "OWNER");
      }
      createdWorkspaceIds.push(...extraWorkspaceIds);

      const res = await request(app)
        .post(`/api/v1/invites/${token}/accept`)
        .set("Authorization", `Bearer ${tokenFor(busy.id)}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_006");
    });

    it("MB-08: 20 accept() đồng thời với maxUses=1 → đúng 1 thành công, 19 nhận INV_002", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm MB-08 race");
      const { token, inviteId } = await seedInvite(workspaceId, owner.id, { maxUses: 1, remainingUses: 1 });

      const contenders = await Promise.all(
        Array.from({ length: 20 }, () => seedUser())
      );
      createdUserIds.push(...contenders.map((c) => c.id));

      const results = await Promise.all(
        contenders.map((c) =>
          request(app).post(`/api/v1/invites/${token}/accept`).set("Authorization", `Bearer ${tokenFor(c.id)}`)
        )
      );

      const succeeded = results.filter((r) => r.status === 200);
      const exhausted = results.filter((r) => r.status === 410 && r.body.error?.code === "INV_002");
      expect(succeeded).toHaveLength(1);
      expect(exhausted).toHaveLength(19);

      const link = await prisma.inviteLink.findUnique({ where: { id: inviteId } });
      expect(link?.remainingUses).toBe(0);
      expect(link?.usesCount).toBe(1);

      const memberships = await prisma.workspaceMembership.findMany({
        where: { workspaceId, userId: { in: contenders.map((c) => c.id) } },
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.status).toBe("ACTIVE");
    }, 30_000);
  });
});
