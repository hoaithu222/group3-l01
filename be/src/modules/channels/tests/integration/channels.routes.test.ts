/**
 * Integration — `/workspaces/:id/channels*`, `/channels/:id*`,
 * `/channels/:id/grants*`, `/admin/...channels*` trên Prisma thật (Mongo
 * memory replset, `TEST_DB=memory`). Redis mock STATEFUL + Socket.IO THẬT
 * (`startHarness`) — cùng lý do `members.routes.test.ts`: archive/grant-revoke
 * gọi `permissionService.revokeScope()`/`bumpVersion()` → có thể chạm
 * `getIO()`/outbox (fail-soft) nên cần server thật đã init.
 *
 * be.md p1-03 §10, README §8 — CH-01, CH-02, CH-03, CH-04, CH-07, CH-08;
 * PR-01, PR-02, PR-07 + admin endpoints. PR-03 (socket 2 thiết bị) tách riêng
 * ở `channels-realtime.test.ts`; PR-06 (chuỗi job `channel.membership-revoked`
 * → `channel.orphan-check`) tách riêng ở `channel-membership-revoked.test.ts`.
 *
 * CH-05/CH-06 (thiết bị — preview phòng thoại, composer ẩn ADMINS_ONLY): không
 * tự động hoá được ở tầng BE, phần ma trận quyền tự động đã có ở
 * `channel-permission.resolver.test.ts` (unit).
 * PR-04 (huỷ push đang chờ khi revoke): nội bộ hàng đợi push (p0-06) — module
 * `channels` chỉ gọi `permissionService.revokeScope()` (đã tự huỷ qua
 * `push.cancel-scope`, xem `permission-ports.ts`), không có gì riêng của
 * `channels` để kiểm ở tầng này; bỏ qua, không fabricate cơ chế push giả.
 * CH-09 (`channel:activity` sau khi commit tin) phụ thuộc `MessageScopeAdapter`
 * CHANNEL (be.md §5.6) — CHƯA implement (chờ p1-04) — bỏ qua, không có gì để
 * gọi.
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
import { normalizeSearch } from "../../../../core/utils/normalize";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../channels.routes";
import channelGrantsRoutes from "../../channel-grants.routes";
import adminChannelsRoutes from "../../admin-channels.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", adminChannelsRoutes);
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
  // `User.normalizedName` mặc định `""` ở schema (@default("")) — KHÔNG tự
  // tính từ `name` ở tầng DB, chỉ luồng đăng ký thật (auth.service.ts) mới
  // set. Set tay ở đây để test tìm kiếm theo tên (channel-membership.repository.prisma.ts#listByChannel)
  // phản ánh đúng hành vi thật thay vì luôn khớp rỗng.
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: normalizeSearch(name) } });
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

describe("/workspaces/:id/channels*, /channels/:id*, /admin/...channels* (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    // `global-setup.ts` chỉ khởi `MongoMemoryReplSet` RỖNG (không chạy `prisma
    // db push`, xem ghi chú `outbox.test.ts`) — tự tạo đúng index unique
    // `@@unique([workspaceId, normalizedName])` cần cho CH-01 (race tạo kênh
    // trùng tên) và CH-03 (patch trùng tên) — không có index thật thì P2002
    // không bao giờ ném, race không bị chặn.
    await prisma.$runCommandRaw({
      createIndexes: "Channel",
      indexes: [{ key: { workspaceId: 1, normalizedName: 1 }, name: "Channel_workspaceId_normalizedName_key", unique: true }],
    });
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

  async function createWorkspace(ownerId: string, name: string): Promise<{ workspaceId: string; defaultChannelId: string }> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return { workspaceId, defaultChannelId: res.body.data.workspace.defaultChannelId as string };
  }

  describe("POST /workspaces/:id/channels — tạo kênh", () => {
    it("OWNER tạo kênh PUBLIC → 201, ChannelDetail đầy đủ myPermissions", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm tạo kênh public");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Frontend", visibility: "PUBLIC" });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("Frontend");
      expect(res.body.data.visibility).toBe("PUBLIC");
      expect(res.body.data.myPermissions).toMatchObject({ canManage: true, canWrite: true });
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.create" }));
    });

    it("ADMIN tạo kênh PRIVATE với initialMemberIds ACTIVE → 201, creator MANAGER, người khác MEMBER", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, admin.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm tạo kênh private");
      await addMembership(workspaceId, admin.id, "ADMIN");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ name: "Kín", visibility: "PRIVATE", initialMemberIds: [member.id] });
      expect(res.status).toBe(201);
      const channelId = res.body.data.id as string;
      expect(res.body.data.myGrant).toMatchObject({ level: "MANAGER" });

      const grant = await prisma.channelGrant.findUnique({
        where: { channelId_subjectKey_source: { channelId, subjectKey: member.id, source: "DIRECT" } },
      });
      expect(grant?.level).toBe("MEMBER");
    });

    it("MEMBER (không phải ADMIN/OWNER) tạo kênh → 403 PERM_001", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm member không tạo được");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`)
        .send({ name: "Không được", visibility: "PUBLIC" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });

    it("CH-01: 2 request tạo kênh trùng tên đồng thời (2 actor khác nhau) → đúng 1x 201, 1x 409 CH_001", async () => {
      const owner = await seedUser();
      const admin2 = await seedUser();
      createdUserIds.push(owner.id, admin2.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-01 race");
      await addMembership(workspaceId, admin2.id, "ADMIN");

      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/v1/workspaces/${workspaceId}/channels`)
          .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
          .send({ name: "Trùng tên", visibility: "PUBLIC" }),
        request(app)
          .post(`/api/v1/workspaces/${workspaceId}/channels`)
          .set("Authorization", `Bearer ${tokenFor(admin2.id)}`)
          .send({ name: "trùng TÊN", visibility: "PUBLIC" }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);
      const failed = resA.status === 409 ? resA : resB;
      expect(failed.body.error.code).toBe("CH_001");

      const count = await prisma.channel.count({ where: { workspaceId, normalizedName: "trung ten" } });
      expect(count).toBe(1);
    }, 20_000);

    it("CH-08: tạo VOICE khi cờ voice tắt → 400 CH_010", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-08");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Phòng thoại", visibility: "PUBLIC", type: "VOICE" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CH_010");
    });
  });

  describe("CH-02/PR-01 — kênh private không quyền → 404 trung tính, không lộ metadata", () => {
    it("MEMBER không có grant mở URL kênh private → 404 PERM_404, body không có tên/mô tả kênh", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-02");
      await addMembership(workspaceId, member.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Bí mật của owner", visibility: "PRIVATE" });
      expect(created.status).toBe(201);
      const channelId = created.body.data.id as string;

      const res = await request(app)
        .get(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PERM_404");
      expect(res.body.data).toBeUndefined();
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain("Bí mật của owner");
    });

    it("PR-01: có grant kênh X nhưng đổi id sang kênh private Y khác (không có grant) → 404, không đọc/quản lý được", async () => {
      const owner = await seedUser();
      const viewer = await seedUser();
      createdUserIds.push(owner.id, viewer.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm PR-01");
      await addMembership(workspaceId, viewer.id, "MEMBER");

      const channelX = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh X", visibility: "PRIVATE", initialMemberIds: [viewer.id] });
      const channelXId = channelX.body.data.id as string;

      const channelY = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh Y", visibility: "PRIVATE" });
      const channelYId = channelY.body.data.id as string;

      // viewer có grant ở X — đọc được X.
      const okX = await request(app)
        .get(`/api/v1/channels/${channelXId}`)
        .set("Authorization", `Bearer ${tokenFor(viewer.id)}`);
      expect(okX.status).toBe(200);

      // Đổi id sang Y (không có grant) → 404, không đọc/quản lý được (be.md PR-01).
      const readY = await request(app)
        .get(`/api/v1/channels/${channelYId}`)
        .set("Authorization", `Bearer ${tokenFor(viewer.id)}`);
      expect(readY.status).toBe(404);

      const grantsY = await request(app)
        .get(`/api/v1/channels/${channelYId}/grants`)
        .set("Authorization", `Bearer ${tokenFor(viewer.id)}`);
      expect(grantsY.status).toBe(404);

      const membersY = await request(app)
        .get(`/api/v1/channels/${channelYId}/members`)
        .set("Authorization", `Bearer ${tokenFor(viewer.id)}`);
      expect(membersY.status).toBe(404);
    });
  });

  describe("CH-03 — đổi tên không phá vỡ ổn định id/route", () => {
    it("PATCH đổi tên → GET cùng id vẫn 200, tên mới, id/route giữ nguyên", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-03");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Tên cũ", visibility: "PUBLIC" });
      const channelId = created.body.data.id as string;

      const patched = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Tên mới", expectedVersion: 1 });
      expect(patched.status).toBe(200);
      expect(patched.body.data.name).toBe("Tên mới");
      expect(patched.body.data.id).toBe(channelId);

      const reread = await request(app)
        .get(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(reread.status).toBe(200);
      expect(reread.body.data.id).toBe(channelId);
      expect(reread.body.data.name).toBe("Tên mới");
    });

    it("trùng tên (theo normalizedName) khi patch → 409 CH_001", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-03 trùng tên");

      await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Đã tồn tại", visibility: "PUBLIC" });
      const second = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh khác", visibility: "PUBLIC" });
      const secondId = second.body.data.id as string;

      const patched = await request(app)
        .patch(`/api/v1/channels/${secondId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Đã tồn tại", expectedVersion: 1 });
      expect(patched.status).toBe(409);
      expect(patched.body.error.code).toBe("CH_001");
    });
  });

  describe("CH-04 — archive giữa lúc thao tác ghi (scope: proxy PATCH/grant-add thay vì gửi tin)", () => {
    it("archive kênh public rồi PATCH → 403 CH_004", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-04 patch");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Sắp bị lưu trữ", visibility: "PUBLIC" });
      const channelId = created.body.data.id as string;

      const archived = await request(app)
        .post(`/api/v1/channels/${channelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });
      expect(archived.status).toBe(200);
      expect(archived.body.data.status).toBe("ARCHIVED");

      const patched = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Không được đổi nữa", expectedVersion: 2 });
      expect(patched.status).toBe(403);
      expect(patched.body.error.code).toBe("CH_004");
    });

    it("archive kênh private rồi thêm grant → 403 CH_004", async () => {
      const owner = await seedUser();
      const newMember = await seedUser();
      createdUserIds.push(owner.id, newMember.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm CH-04 grant");
      await addMembership(workspaceId, newMember.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư sắp lưu trữ", visibility: "PRIVATE" });
      const channelId = created.body.data.id as string;

      const archived = await request(app)
        .post(`/api/v1/channels/${channelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });
      expect(archived.status).toBe(200);

      const grantAdd = await request(app)
        .post(`/api/v1/channels/${channelId}/grants`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ userIds: [newMember.id], level: "MEMBER" });
      expect(grantAdd.status).toBe(403);
      expect(grantAdd.body.error.code).toBe("CH_004");
    });
  });

  describe("CH-07 — archive kênh mặc định không kèm thay thế → 409 CH_005", () => {
    it("archive defaultChannelId không truyền replacementDefaultChannelId → 409 CH_005", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { defaultChannelId } = await createWorkspace(owner.id, "Nhóm CH-07");

      const res = await request(app)
        .post(`/api/v1/channels/${defaultChannelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CH_005");

      const still = await prisma.channel.findUniqueOrThrow({ where: { id: defaultChannelId } });
      expect(still.status).toBe("ACTIVE");
    });

    it("archive kênh mặc định kèm replacement hợp lệ → 200, kênh mới trở thành mặc định", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId, defaultChannelId } = await createWorkspace(owner.id, "Nhóm CH-07 hợp lệ");

      const replacement = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh thay thế", visibility: "PUBLIC" });
      const replacementId = replacement.body.data.id as string;

      const res = await request(app)
        .post(`/api/v1/channels/${defaultChannelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1, replacementDefaultChannelId: replacementId });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("ARCHIVED");

      const newDefault = await prisma.channel.findUniqueOrThrow({ where: { id: replacementId } });
      expect(newDefault.isDefault).toBe(true);
      const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      expect(ws.defaultChannelId).toBe(replacementId);
    });
  });

  describe("PR-02 — owner không có grant kênh private: vô hình trong list/search, join 404", () => {
    it("kênh private không xuất hiện trong joined/discoverable/search của owner không grant; join → 404", async () => {
      const owner = await seedUser();
      const admin2 = await seedUser();
      createdUserIds.push(owner.id, admin2.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm PR-02");
      await addMembership(workspaceId, admin2.id, "ADMIN");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(admin2.id)}`)
        .send({ name: "Riêng tư của admin2", visibility: "PRIVATE" });
      expect(created.status).toBe(201);
      const channelId = created.body.data.id as string;

      const listRes = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(listRes.status).toBe(200);
      const allIds = [
        ...listRes.body.data.joined.map((c: { id: string }) => c.id),
        ...listRes.body.data.discoverable.map((c: { id: string }) => c.id),
      ];
      expect(allIds).not.toContain(channelId);

      const searchRes = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/channels/search?q=rieng`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.map((c: { id: string }) => c.id)).not.toContain(channelId);

      const joinRes = await request(app)
        .post(`/api/v1/channels/${channelId}/join`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(joinRes.status).toBe(404);
    });
  });

  describe("PR-07 — thêm người mới vào kênh private: grant thành công, kênh trở nên nhìn thấy/đã tham gia", () => {
    it("MANAGER cấp MEMBER cho người mới → grant 201, người đó GET/list thấy kênh", async () => {
      const owner = await seedUser();
      const newcomer = await seedUser();
      createdUserIds.push(owner.id, newcomer.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm PR-07");
      await addMembership(workspaceId, newcomer.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư PR-07", visibility: "PRIVATE" });
      const channelId = created.body.data.id as string;

      // Trước khi grant — 404 (đúng PR-02 semantics).
      const before = await request(app)
        .get(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(newcomer.id)}`);
      expect(before.status).toBe(404);

      const grantRes = await request(app)
        .post(`/api/v1/channels/${channelId}/grants`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ userIds: [newcomer.id], level: "MEMBER" });
      expect(grantRes.status).toBe(201);
      expect(grantRes.body.data.added).toEqual([newcomer.id]);

      const after = await request(app)
        .get(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(newcomer.id)}`);
      expect(after.status).toBe(200);
      expect(after.body.data.myGrant).toMatchObject({ level: "MEMBER" });

      const listRes = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/channels?include=joined`)
        .set("Authorization", `Bearer ${tokenFor(newcomer.id)}`);
      expect(listRes.body.data.joined.map((c: { id: string }) => c.id)).toContain(channelId);
    });

    it("grant lặp lại người đã có cùng level → idempotent, skipped ALREADY", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm PR-07 idempotent");
      await addMembership(workspaceId, member.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư idempotent", visibility: "PRIVATE", initialMemberIds: [member.id] });
      const channelId = created.body.data.id as string;

      const grantRes = await request(app)
        .post(`/api/v1/channels/${channelId}/grants`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ userIds: [member.id], level: "MEMBER" });
      expect(grantRes.status).toBe(201);
      expect(grantRes.body.data.added).toEqual([]);
      expect(grantRes.body.data.skipped).toEqual([{ userId: member.id, reason: "ALREADY" }]);
    });
  });

  describe("MANAGER cuối — CH_003 qua HTTP (revoke/patch)", () => {
    it("DELETE grant của MANAGER cuối → 409 CH_003", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm manager cuối revoke");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư 1 manager", visibility: "PRIVATE" });
      const channelId = created.body.data.id as string;

      const res = await request(app)
        .delete(`/api/v1/channels/${channelId}/grants/${owner.id}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CH_003");
    });

    it("chính chủ (không phải manage) tự rời DELETE /grants/:mình → cho phép nếu KHÔNG phải manager cuối", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm tự rời grant");
      await addMembership(workspaceId, member.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư tự rời", visibility: "PRIVATE", initialMemberIds: [member.id] });
      const channelId = created.body.data.id as string;

      const res = await request(app)
        .delete(`/api/v1/channels/${channelId}/grants/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(200);

      const grant = await prisma.channelGrant.findUnique({
        where: { channelId_subjectKey_source: { channelId, subjectKey: member.id, source: "DIRECT" } },
      });
      expect(grant).toBeNull();
    });
  });

  describe("Round-trip cơ bản: join/leave/me/members", () => {
    it("join kênh public → leave → join lại, memberCount ổn định", async () => {
      const owner = await seedUser();
      const joiner = await seedUser();
      createdUserIds.push(owner.id, joiner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm join/leave");
      await addMembership(workspaceId, joiner.id, "MEMBER");

      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Công khai join", visibility: "PUBLIC" });
      const channelId = created.body.data.id as string;

      const join1 = await request(app)
        .post(`/api/v1/channels/${channelId}/join`)
        .set("Authorization", `Bearer ${tokenFor(joiner.id)}`);
      expect(join1.status).toBe(200);

      const leave1 = await request(app)
        .post(`/api/v1/channels/${channelId}/leave`)
        .set("Authorization", `Bearer ${tokenFor(joiner.id)}`);
      expect(leave1.status).toBe(200);

      const join2 = await request(app)
        .post(`/api/v1/channels/${channelId}/join`)
        .set("Authorization", `Bearer ${tokenFor(joiner.id)}`);
      expect(join2.status).toBe(200);

      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
      expect(channel.memberCount).toBe(2); // owner + joiner (đã leave rồi join lại đúng 1 lần)
    });

    it("PATCH /me cập nhật pinned/notifyMode", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { defaultChannelId } = await createWorkspace(owner.id, "Nhóm PATCH me");

      const res = await request(app)
        .patch(`/api/v1/channels/${defaultChannelId}/me`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ pinned: true, notifyMode: "MUTED" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ pinned: true, notifyMode: "MUTED" });
    });

    it("GET /channels/:id/members (public) không cần quyền quản lý", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { defaultChannelId } = await createWorkspace(owner.id, "Nhóm GET members");

      const res = await request(app)
        .get(`/api/v1/channels/${defaultChannelId}/members`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /channels/:id/members?q= lọc theo tên không dấu (channel-membership.repository.prisma.ts#listByChannel app-level filter)", async () => {
      const owner = await seedUser({ name: "Chủ nhóm" });
      const danAn = await seedUser({ name: "Đàm Đình An" });
      const binhMinh = await seedUser({ name: "Bình Minh" });
      createdUserIds.push(owner.id, danAn.id, binhMinh.id);
      const { workspaceId, defaultChannelId } = await createWorkspace(owner.id, "Nhóm GET members q");
      await addMembership(workspaceId, danAn.id, "MEMBER");
      await addMembership(workspaceId, binhMinh.id, "MEMBER");
      // Kênh mặc định PUBLIC — join tự động cho thành viên workspace không xảy
      // ra (chỉ owner có ChannelMembership lúc bootstrap); tự join qua route.
      await request(app).post(`/api/v1/channels/${defaultChannelId}/join`).set("Authorization", `Bearer ${tokenFor(danAn.id)}`);
      await request(app).post(`/api/v1/channels/${defaultChannelId}/join`).set("Authorization", `Bearer ${tokenFor(binhMinh.id)}`);

      // "dam dinh" (không dấu) phải khớp "Đàm Đình An" (normalizeSearch app-level).
      const res = await request(app)
        .get(`/api/v1/channels/${defaultChannelId}/members?q=dam+dinh`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userId).toBe(danAn.id);

      const noMatch = await request(app)
        .get(`/api/v1/channels/${defaultChannelId}/members?q=khong-khop-voi-ai`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(noMatch.body.data).toHaveLength(0);
    });
  });

  describe("Admin — /admin/workspaces/:id/channels*, /admin/channels/:id/archive|restore", () => {
    it("GET /admin/workspaces/:id/channels → public rows + privateCount/privateArchivedCount", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm admin channels");
      await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư admin count", visibility: "PRIVATE" });

      const res = await request(app)
        .get(`/api/v1/admin/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "manager")}`);
      expect(res.status).toBe(200);
      expect(res.body.data.privateCount).toBe(1);
      expect(res.body.data.privateArchivedCount).toBe(0);
      expect(res.body.data.public.length).toBeGreaterThanOrEqual(1); // ít nhất kênh "Chung"
    });

    it("role không có quyền workspace:view → 403", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm admin 403");

      const res = await request(app)
        .get(`/api/v1/admin/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "user")}`);
      expect(res.status).toBe(403);
    });

    it("POST /admin/channels/:id/archive trên kênh PRIVATE → 403 CH_012", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm admin CH_012");
      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Riêng tư CH_012", visibility: "PRIVATE" });
      const channelId = created.body.data.id as string;

      const res = await request(app)
        .post(`/api/v1/admin/channels/${channelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CH_012");
    });

    it("POST /admin/channels/:id/archive trên kênh mặc định → 409 CH_005", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { defaultChannelId } = await createWorkspace(owner.id, "Nhóm admin CH_005");

      const res = await request(app)
        .post(`/api/v1/admin/channels/${defaultChannelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CH_005");
    });

    it("POST /admin/channels/:id/archive trên kênh PUBLIC thường (không mặc định) → 200, archiveReason PLATFORM", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm admin archive ok");
      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh vi phạm", visibility: "PUBLIC" });
      const channelId = created.body.data.id as string;

      const res = await request(app)
        .post(`/api/v1/admin/channels/${channelId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng" });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("ARCHIVED");

      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
      expect(channel.archiveReason).toBe("PLATFORM");

      const restore = await request(app)
        .post(`/api/v1/admin/channels/${channelId}/restore`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Xem xét lại, khôi phục" });
      expect(restore.status).toBe(200);
      expect(restore.body.data.status).toBe("ACTIVE");
    });
  });

  /** Chèn thẳng 1 kênh VOICE PUBLIC (tạo qua API cần cờ `voice` bật — CH_010) vào workspace của test. */
  async function seedVoiceChannel(
    workspaceId: string,
    ownerId: string,
    name: string,
    voiceSettings?: { allowVideo: boolean; maxParticipants: number }
  ): Promise<string> {
    const id = newObjectId();
    await prisma.channel.create({
      data: {
        id,
        workspaceId,
        name,
        normalizedName: normalizeSearch(name),
        type: "VOICE",
        visibility: "PUBLIC",
        postingPolicy: "MEMBERS",
        status: "ACTIVE",
        isDefault: false,
        position: 0,
        lastSeq: 0,
        memberCount: 0,
        createdBy: ownerId,
        version: 1,
        ...(voiceSettings ? { voiceSettings } : {}),
      },
    });
    return id;
  }

  describe("p2-03 — PATCH /channels/:id nhận voiceSettings (kênh VOICE)", () => {
    it("đặt allowVideo=false + maxParticipants → 200 (ChannelDetail.voiceSettings hiệu lực), DB ghi cả khối, outbox channel.updated + dòng RIÊNG cho calls", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice patch");
      const channelId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại A");

      const res = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ voiceSettings: { allowVideo: false, maxParticipants: 4 }, expectedVersion: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: channelId, version: 2, voiceSettings: { allowVideo: false, maxParticipants: 4 } });

      const row = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
      expect(row.voiceSettings).toEqual({ allowVideo: false, maxParticipants: 4 });

      const events = await prisma.outboxEvent.findMany({ where: { aggregateType: "Channel", aggregateId: channelId } });
      expect(events.map((e) => e.dedupeKey).sort()).toEqual(
        [`channel.updated:${channelId}:v2`, `call.channel-video-disabled:channel:${channelId}:v2`].sort()
      );
      const forCalls = events.find((e) => e.jobName === "call.channel-video-disabled");
      expect(forCalls).toMatchObject({ queue: "calls", payload: { channelId, workspaceId } });
    });

    it("gửi từng trường: chỉ maxParticipants → giữ allowVideo hiện có, KHÔNG có dòng outbox thu camera", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice partial");
      const channelId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại B", { allowVideo: false, maxParticipants: 8 });

      const res = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ voiceSettings: { maxParticipants: 5 }, expectedVersion: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data.voiceSettings).toEqual({ allowVideo: false, maxParticipants: 5 });
      const events = await prisma.outboxEvent.findMany({
        where: { aggregateType: "Channel", aggregateId: channelId, jobName: "call.channel-video-disabled" },
      });
      expect(events).toHaveLength(0);
    });

    it("bật lại allowVideo=true không xếp job thu camera; kênh chưa từng đặt voiceSettings đọc ra mặc định", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice default");
      const channelId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại C");

      const detail = await request(app).get(`/api/v1/channels/${channelId}`).set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(detail.body.data.voiceSettings).toEqual({ allowVideo: true, maxParticipants: 8 });

      const res = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ voiceSettings: { allowVideo: true }, expectedVersion: 1 });
      expect(res.status).toBe(200);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: channelId, jobName: "call.channel-video-disabled" } })).toBe(0);
    });

    it("vượt trần LIMITS.voice.maxParticipants / dưới 2 / khoá lạ / rỗng → 400 VAL_001", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice invalid");
      const channelId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại D");
      for (const voiceSettings of [{ maxParticipants: 9 }, { maxParticipants: 1 }, { maxParticipants: 4, extra: 1 }, {}]) {
        const res = await request(app)
          .patch(`/api/v1/channels/${channelId}`)
          .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
          .send({ voiceSettings, expectedVersion: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VAL_001");
      }
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channelId } })).version).toBe(1);
    });

    it("kênh TEXT nhận voiceSettings → 400 VAL_001 (không lặng lẽ bỏ qua, version không đổi)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice on text");
      const created = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh chữ", visibility: "PUBLIC" });
      const textId = created.body.data.id as string;
      const res = await request(app)
        .patch(`/api/v1/channels/${textId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ voiceSettings: { allowVideo: false }, expectedVersion: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: textId } })).version).toBe(1);
    });

    it("thành viên thường (không manage) → 403; version lệch → 409 RES_003", async () => {
      const owner = await seedUser();
      const member = await seedUser({ name: "Thành viên" });
      createdUserIds.push(owner.id, member.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm voice perm");
      await addMembership(workspaceId, member.id, "MEMBER");
      const channelId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại E");

      const denied = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`)
        .send({ voiceSettings: { allowVideo: false }, expectedVersion: 1 });
      expect(denied.status).toBe(403);

      const stale = await request(app)
        .patch(`/api/v1/channels/${channelId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ voiceSettings: { allowVideo: false }, expectedVersion: 7 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("RES_003");
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channelId } })).voiceSettings).toBeNull();
    });
  });

  describe("admin — lọc status/type phía server", () => {
    it("GET /admin/workspaces/:id/channels?status=&type= lọc ĐÚNG tập và meta.total theo bộ lọc; không lọc → đủ; giá trị sai → 400", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const { workspaceId } = await createWorkspace(owner.id, "Nhóm admin filter");
      const voiceId = await seedVoiceChannel(workspaceId, owner.id, "Phòng thoại lọc");
      const text = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/channels`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Kênh chữ sẽ lưu trữ", visibility: "PUBLIC" });
      const textId = text.body.data.id as string;
      await request(app)
        .post(`/api/v1/channels/${textId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });

      const get = (qs: string) =>
        request(app)
          .get(`/api/v1/admin/workspaces/${workspaceId}/channels${qs}`)
          .set("Authorization", `Bearer ${tokenFor(newObjectId(), "manager")}`);

      const all = await get("");
      expect(all.body.data.meta.total).toBe(3); // Chung + thoại + chữ đã lưu trữ

      const voice = await get("?type=VOICE");
      expect(voice.status).toBe(200);
      expect(voice.body.data.public.map((c: { id: string }) => c.id)).toEqual([voiceId]);
      expect(voice.body.data.meta.total).toBe(1);

      const arch = await get("?status=ARCHIVED");
      expect(arch.body.data.public.map((c: { id: string }) => c.id)).toEqual([textId]);
      expect(arch.body.data.meta.total).toBe(1);

      const none = await get("?status=ARCHIVED&type=VOICE");
      expect(none.body.data.public).toEqual([]);
      expect(none.body.data.meta.total).toBe(0);
      expect(none.body.data.privateCount).toBe(0); // chỉ số tổng KHÔNG bị lọc

      expect((await get("?status=DELETED")).status).toBe(400);
    });
  });
});
