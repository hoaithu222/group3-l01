/**
 * Integration — `/workspaces*` trên Prisma thật (Mongo memory replset,
 * `TEST_DB=memory`). Redis mock STATEFUL (Map trong bộ nhớ) thay vì Redis
 * thật — môi trường dev không có Redis sống (giống `system-config.routes.test.ts`
 * "Redis mock ... giống admin-push/multi-instance test"), nhưng khác test đó
 * ở chỗ mock này có state thật cho `get/set/incr` để `idempotencyKey`/
 * `scopeLimiter`/cache quyền hoạt động ĐÚNG hành vi (không chỉ no-op), phục
 * vụ WS-01 (idempotent create) cần replay thật.
 */
// Cờ `communication` phải bật TRƯỚC khi `core/constants/modules.ts` được
// import lần đầu (tính `FEATURE_FLAGS` 1 lần lúc module load) — đặt trước cả
// `jest.mock` để chắc chắn chạy sớm nhất trong file này.
process.env.FEATURE_FLAGS = "communication=true";

// `RuntimeConfigService.isFeatureEnabled()` còn đòi `AVAILABLE_MODULES.includes(m)`
// (be.md p0-07 §5.2) — CHỦ Ý CHƯA thêm "communication" vào bản thật
// (`core/constants/modules.ts`) cho tới khi p1-01..p1-04 merge xong (README
// p1-01 §7), tránh bật nhầm cả phân hệ giao tiếp khi mới có mỗi workspace.
// Test này CẦN gọi được route để xác minh p1-01 tự nó đúng → override cục bộ
// CHỈ trong file test, không đụng file thật.
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

const redisStore = new Map<string, unknown>();
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
import workspacesRoutes from "../../workspaces.routes";
import adminWorkspacesRoutes from "../../admin-workspaces.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/admin/workspaces", adminWorkspacesRoutes);
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

describe("/workspaces (integration — Mongo memory replset)", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá mọi mockImplementation trước MỖI
    // test — phải khai báo lại ở đây, không chỉ ở factory `jest.mock` phía
    // trên (giống `system-config.routes.test.ts`).
    (redis.get as jest.Mock).mockImplementation(redisGetImpl);
    (redis.set as jest.Mock).mockImplementation(redisSetImpl);
    (redis.del as jest.Mock).mockImplementation(redisDelImpl);
    (redis.getdel as jest.Mock).mockImplementation(redisGetdelImpl);
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    mockAuditRecord.mockClear();
  });

  describe("POST /workspaces", () => {
    it("WS-01: bấm Tạo 2 lần cùng Idempotency-Key → chỉ 1 workspace, 1 kênh mặc định", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const token = tokenFor(owner.id);
      const key = `idem-${newObjectId()}`;

      const first = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", key)
        .send({ name: "Nhóm WS-01" });
      expect(first.status).toBe(201);
      const workspaceId = first.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const second = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", key)
        .send({ name: "Nhóm WS-01" });
      expect(second.status).toBe(201);
      expect(second.body.data.workspace.id).toBe(workspaceId);

      const count = await prisma.workspace.count({ where: { id: workspaceId } });
      expect(count).toBe(1);
      const channels = await prisma.channel.count({ where: { workspaceId } });
      expect(channels).toBe(1);
    });

    it("tạo nhóm thật: có membership OWNER + kênh 'Chung' + defaultChannelId", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const res = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm mới", description: "Mô tả" });

      expect(res.status).toBe(201);
      const workspaceId = res.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);
      expect(res.body.data.defaultChannel.name).toBe("Chung");
      expect(res.body.data.workspace.myRole).toBe("OWNER");

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: owner.id } },
      });
      expect(membership?.role).toBe("OWNER");
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      expect(workspace?.defaultChannelId).toBeTruthy();
    });
  });

  describe("Quyền theo scope", () => {
    it("WS-08: người ngoài GET /workspaces/:id → 404 trung tính", async () => {
      const owner = await seedUser();
      const stranger = await seedUser();
      createdUserIds.push(owner.id, stranger.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm riêng" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}`)
        .set("Authorization", `Bearer ${tokenFor(stranger.id)}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /workspaces/:id", () => {
    it("WS-05: version lệch → 409 RES_003", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm version" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Tên mới", expectedVersion: 999 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("RES_003");
    });

    it("sửa tên thành công → version tăng, tên đổi", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Tên cũ" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Tên mới", expectedVersion: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Tên mới");
      expect(res.body.data.version).toBe(2);
    });

    it("múi giờ nhóm (đồng bộ chéo #9): tạo với IANA hợp lệ; GET trả timezone + effectiveTimezone; PATCH đổi / null = về mặc định; sai IANA → 400", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const auth = { Authorization: `Bearer ${tokenFor(owner.id)}` };
      const created = await request(app).post("/api/v1/workspaces").set(auth).set("Idempotency-Key", `idem-${newObjectId()}`).send({ name: "Nhóm múi giờ", timezone: "Asia/Tokyo" });
      expect(created.status).toBe(201);
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);
      expect(created.body.data.workspace).toMatchObject({ timezone: "Asia/Tokyo", effectiveTimezone: "Asia/Tokyo" });
      expect((await prisma.workspace.findUnique({ where: { id: workspaceId } }))?.timezone).toBe("Asia/Tokyo");

      const bad = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ timezone: "Khong/Ton_Tai", expectedVersion: 1 });
      expect(bad.status).toBe(400);

      const changed = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ timezone: "Europe/Paris", expectedVersion: 1 });
      expect(changed.status).toBe(200);
      expect(changed.body.data).toMatchObject({ timezone: "Europe/Paris", effectiveTimezone: "Europe/Paris", version: 2 });

      const reset = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ timezone: null, expectedVersion: 2 });
      expect(reset.body.data.timezone).toBeNull();
      expect(reset.body.data.effectiveTimezone).toBe("Asia/Ho_Chi_Minh"); // mặc định hệ thống (pm.timezone → CRON_TZ)

      const read = await request(app).get(`/api/v1/workspaces/${workspaceId}`).set(auth);
      expect(read.body.data).toMatchObject({ timezone: null, effectiveTimezone: "Asia/Ho_Chi_Minh" });
      // Nhóm tạo KHÔNG kèm timezone: ghi null tường minh (không để trường vắng mặt).
      const plain = await request(app).post("/api/v1/workspaces").set(auth).set("Idempotency-Key", `idem-${newObjectId()}`).send({ name: "Nhóm mặc định" });
      createdWorkspaceIds.push(plain.body.data.workspace.id as string);
      expect(plain.body.data.workspace.timezone).toBeNull();
      const raw = await prisma.workspace.findRaw({ filter: { _id: { $oid: plain.body.data.workspace.id as string } } });
      expect((raw as unknown as Array<Record<string, unknown>>)[0]).toHaveProperty("timezone", null);
    });
  });

  describe("Archive/restore/leave", () => {
    it("WS-04: archive rồi PATCH tiếp → 403 WS_002", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm archive" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const archived = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });
      expect(archived.status).toBe(200);
      expect(archived.body.data.status).toBe("ARCHIVED");

      const patchAfter = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ name: "Không được đổi", expectedVersion: 2 });
      expect(patchAfter.status).toBe(403);
      expect(patchAfter.body.error.code).toBe("WS_002");
    });

    it("WS-03: OWNER tự rời nhóm → 409 WS_004", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm leave" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/leave`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_004");
    });
  });

  describe("Chuyển quyền sở hữu", () => {
    it("WS-05 (transfer): confirmName sai → 400 WS_005; đúng → đổi owner", async () => {
      const owner = await seedUser();
      const member = await seedUser({ name: "Trần Thị B" });
      createdUserIds.push(owner.id, member.id);

      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm transfer" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      await prisma.workspaceMembership.create({
        data: { workspaceId, userId: member.id, role: "MEMBER" },
      });

      const wrongName = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/transfer-owner`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ toUserId: member.id, confirmName: "Sai tên", expectedVersion: 1 });
      expect(wrongName.status).toBe(400);
      expect(wrongName.body.error.code).toBe("WS_005");

      const ok = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/transfer-owner`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ toUserId: member.id, confirmName: "Trần Thị B", expectedVersion: 1 });
      expect(ok.status).toBe(200);

      const oldOwnerMembership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: owner.id } },
      });
      const newOwnerMembership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(oldOwnerMembership?.role).toBe("ADMIN");
      expect(newOwnerMembership?.role).toBe("OWNER");
    });
  });

  describe("Ảnh nhóm (avatar + bìa + mẫu nền) — cột và AssetLink cùng transaction", () => {
    const assetIds: string[] = [];

    afterEach(async () => {
      const notes = await prisma.notification.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } });
      const recipients = await prisma.notificationRecipient.findMany({
        where: { notificationId: { in: notes.map((n) => n.id) } },
        select: { notificationId: true, recipientId: true },
      });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: recipients.map((r) => `${r.notificationId}:${r.recipientId}`) } } });
      await prisma.notificationRecipient.deleteMany({ where: { notificationId: { in: notes.map((n) => n.id) } } });
      await prisma.notification.deleteMany({ where: { id: { in: notes.map((n) => n.id) } } });
      await prisma.assetLink.deleteMany({ where: { assetId: { in: assetIds } } });
      await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      assetIds.length = 0;
    });

    async function seedImage(ownerId: string, scope: "AVATAR" | "MESSAGE" = "AVATAR"): Promise<string> {
      const id = newObjectId();
      await prisma.asset.create({
        data: {
          id,
          ownerId,
          scope,
          kind: "IMAGE",
          uploadMethod: "API_PUT",
          mime: "image/png",
          declaredSize: 10,
          originalName: "a.png",
          storageKey: `test/workspace-image/${id}.png`,
          status: "READY",
        },
      });
      assetIds.push(id);
      return id;
    }

    async function createWithImages(ownerId: string, body: Record<string, unknown>): Promise<string> {
      const res = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm có ảnh", ...body });
      expect(res.status).toBe(201);
      const workspaceId = res.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);
      return workspaceId;
    }

    const linksOf = (workspaceId: string) =>
      prisma.assetLink.findMany({ where: { targetId: workspaceId, targetType: { in: ["WORKSPACE_AVATAR", "WORKSPACE_COVER"] } }, orderBy: { targetType: "asc" } });
    const imageUrl = (assetId: string, variant: "THUMB" | "ORIGINAL") =>
      expect.stringMatching(new RegExp(`/api/v1/assets/${assetId}/image\\?v=${variant}&e=\\d+&s=[0-9a-f]{64}$`));

    it("tạo nhóm kèm avatar + bìa + preset: cột + 2 link scope WORKSPACE; response, GET chi tiết và GET danh sách đều có 4 trường ảnh", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const avatar = await seedImage(owner.id);
      const cover = await seedImage(owner.id);
      const auth = { Authorization: `Bearer ${tokenFor(owner.id)}` };

      const workspaceId = await createWithImages(owner.id, { avatarAssetId: avatar, coverAssetId: cover, coverPreset: "forest" });

      const row = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      expect(row).toMatchObject({ avatarAssetId: avatar, coverAssetId: cover, coverPreset: "forest" });
      expect((await linksOf(workspaceId)).map((l) => [l.targetType, l.assetId, l.scopeType, l.scopeId])).toEqual([
        ["WORKSPACE_AVATAR", avatar, "WORKSPACE", workspaceId],
        ["WORKSPACE_COVER", cover, "WORKSPACE", workspaceId],
      ]);
      const images = { avatarUrl: imageUrl(avatar, "THUMB"), coverUrl: imageUrl(cover, "ORIGINAL"), coverThumbUrl: imageUrl(cover, "THUMB"), coverPreset: "forest" };
      expect((await request(app).get(`/api/v1/workspaces/${workspaceId}`).set(auth)).body.data).toMatchObject(images);
      const list = await request(app).get("/api/v1/workspaces").set(auth);
      expect((list.body.data as Array<{ id: string }>).find((w) => w.id === workspaceId)).toMatchObject(images);
    });

    it("PATCH bìa bằng asset sai scope → 415 ASSET_001 và ROLLBACK cả cột lẫn version (updateMany đã chạy trước replace); null → gỡ; chỉ preset → không đụng link", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const cover = await seedImage(owner.id);
      const wrongScope = await seedImage(owner.id, "MESSAGE");
      const auth = { Authorization: `Bearer ${tokenFor(owner.id)}` };
      const workspaceId = await createWithImages(owner.id, { coverAssetId: cover });

      const rejected = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ coverAssetId: wrongScope, expectedVersion: 1 });
      expect(rejected.status).toBe(415);
      expect(rejected.body.error.code).toBe("ASSET_001");
      expect(await prisma.workspace.findUnique({ where: { id: workspaceId } })).toMatchObject({ coverAssetId: cover, version: 1 });
      expect((await linksOf(workspaceId)).map((l) => l.assetId)).toEqual([cover]);

      const preset = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ coverPreset: "amber", expectedVersion: 1 });
      expect(preset.status).toBe(200);
      expect(preset.body.data).toMatchObject({ coverPreset: "amber", version: 2, coverUrl: imageUrl(cover, "ORIGINAL") });
      expect((await linksOf(workspaceId)).map((l) => l.assetId)).toEqual([cover]);

      const removed = await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ coverAssetId: null, expectedVersion: 2 });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject({ coverUrl: null, coverThumbUrl: null, coverPreset: "amber", version: 3 });
      expect(await prisma.workspace.findUnique({ where: { id: workspaceId } })).toMatchObject({ coverAssetId: null });
      expect(await linksOf(workspaceId)).toEqual([]);
    });

    it("GET chi tiết trả timezone đã đặt (trước đây mapWorkspace bỏ sót ⇒ luôn null)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const auth = { Authorization: `Bearer ${tokenFor(owner.id)}` };
      const workspaceId = await createWithImages(owner.id, {});

      await request(app).patch(`/api/v1/workspaces/${workspaceId}`).set(auth).send({ timezone: "Europe/Paris", expectedVersion: 1 });

      expect((await request(app).get(`/api/v1/workspaces/${workspaceId}`).set(auth)).body.data).toMatchObject({
        timezone: "Europe/Paris",
        effectiveTimezone: "Europe/Paris",
      });
    });

    it("admin gỡ bìa rồi gỡ avatar: cột null + link gỡ + version tăng + audit; chủ nhóm nhận ĐỦ 2 thông báo; gỡ lại → removed:false; thiếu quyền → 403; id sai → 400", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const avatar = await seedImage(owner.id);
      const cover = await seedImage(owner.id);
      const workspaceId = await createWithImages(owner.id, { avatarAssetId: avatar, coverAssetId: cover, coverPreset: "rose" });
      const admin = { Authorization: `Bearer ${tokenFor(newObjectId(), "admin")}` };
      const removeImage = (kind: "AVATAR" | "COVER", headers = admin, id = workspaceId) =>
        request(app).post(`/api/v1/admin/workspaces/${id}/remove-image`).set(headers).send({ kind, reason: "Ảnh vi phạm tiêu chuẩn cộng đồng" });

      expect((await removeImage("COVER", { Authorization: `Bearer ${tokenFor(owner.id)}` })).status).toBe(403);
      expect((await removeImage("COVER", admin, "khong-phai-id")).status).toBe(400);

      const coverRes = await removeImage("COVER");
      expect(coverRes.status).toBe(200);
      expect(coverRes.body.data).toMatchObject({
        removed: true,
        workspace: { id: workspaceId, coverUrl: null, coverThumbUrl: null, coverPreset: "rose", avatarUrl: imageUrl(avatar, "THUMB") },
      });
      expect(await prisma.workspace.findUnique({ where: { id: workspaceId } })).toMatchObject({ coverAssetId: null, avatarAssetId: avatar, version: 2 });
      expect((await linksOf(workspaceId)).map((l) => l.targetType)).toEqual(["WORKSPACE_AVATAR"]);
      expect(mockAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: "workspace.image-remove", targetId: workspaceId, metadata: { kind: "COVER" } })
      );

      expect((await removeImage("AVATAR")).body.data).toMatchObject({ removed: true, workspace: { avatarUrl: null } });
      expect(await linksOf(workspaceId)).toEqual([]);
      // Mỗi lần gỡ một mục hộp thư riêng cho chủ nhóm (không bị gộp theo `source.id`).
      const notes = await prisma.notification.findMany({ where: { workspaceId, type: "workspace.admin-change" }, select: { id: true, refs: true } });
      expect(notes.map((n) => (n.refs as { action?: string }).action).sort()).toEqual(["avatar-removed", "cover-removed"]);
      expect(await prisma.notificationRecipient.count({ where: { notificationId: { in: notes.map((n) => n.id) }, recipientId: owner.id } })).toBe(2);

      mockAuditRecord.mockClear();
      const again = await removeImage("COVER");
      expect(again.status).toBe(200);
      expect(again.body.data.removed).toBe(false);
      expect(mockAuditRecord).not.toHaveBeenCalled();
      expect((await prisma.workspace.findUnique({ where: { id: workspaceId } }))?.version).toBe(3);
    });
  });

  describe("Admin — lưu trữ cấp nền tảng", () => {
    it("WS-10: admin archive có lý do → audit + OWNER không tự khôi phục được (WS_009)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const created = await request(app)
        .post("/api/v1/workspaces")
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .set("Idempotency-Key", `idem-${newObjectId()}`)
        .send({ name: "Nhóm admin archive" });
      const workspaceId = created.body.data.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);

      const archived = await request(app)
        .post(`/api/v1/admin/workspaces/${workspaceId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản sử dụng nền tảng" });
      expect(archived.status).toBe(200);
      expect(mockAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: "workspace.platform-archive", targetId: workspaceId })
      );

      const restoreByOwner = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/restore`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 2 });
      expect(restoreByOwner.status).toBe(403);
      expect(restoreByOwner.body.error.code).toBe("WS_009");
    });
  });
});
