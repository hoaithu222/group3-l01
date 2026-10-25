/**
 * Ảnh đại diện người dùng (p0-01 be.md §5.6, SEC-12) — `UserAvatarService` + `PATCH /users/:id { avatarAssetId }` + `GET /users/:id/avatar`.
 * Prisma THẬT qua `TEST_DB=memory` (MongoMemoryReplSet): `set()` ghi `User` + `AssetLink` trong CÙNG transaction nên không giả lập được bằng
 * repo in-memory (cùng lý do `anonymizer.test.ts`). Redis mock ở tầng "unit"; `outboxSignal` mock để test không phụ thuộc Redis thật.
 *
 * ⚠ SEC-12 CHƯA CHỐT (kiểm 2026-09-26): đặt avatar bằng asset của NGƯỜI KHÁC hiện trả `403 ASSET_005` (từ `AssetLinkService.attach`),
 * KHÔNG phải `404` trung tính như SEC-12 mô tả. Các ca bên dưới KHOÁ HÀNH VI HIỆN TẠI (403) — nếu sản phẩm chốt 404, đổi mã ở
 * `UserAvatarService.set` (kiểm `asset.ownerId` ở đầu, mã mới) và đổi CÁC CA ĐÁNH DẤU "SEC-12" trong file này, không cần sửa ca nào khác.
 */
jest.mock("../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});
jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { JwtUtils } from "../../../core/utils/jwt";
import { newObjectId } from "../../../core/utils/object-id";
import { prisma } from "../../../infrastructure/database";
import { redis } from "../../../infrastructure/redis";
import { createAssetLinkService, createAssetUrlService } from "../../assets/public";
import { PrismaUserRepository } from "../repositories";
import { UserAnonymizer } from "../services/user-anonymizer";
import { UserAvatarService } from "../services/user-avatar.service";
import userRoutes from "../user.routes";

// Chốt an toàn như `anonymizer.test.ts`: chỉ chạy trên Mongo memory (`TEST_DB=memory`), thiếu ⇒ SKIP, không phải loopback ⇒ từ chối.
const describeMemoryDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}

// URL ảnh đại diện trả cho client (`AuthUserDto.avatar`, `avatarUrl` của các module) nay là URL ký sẵn — test ở
// `src/shared/media/tests/display-image.test.ts`. File này giữ phần đặt/gỡ ảnh và endpoint Bearer cũ `GET /users/:id/avatar`.
describeMemoryDb("Ảnh đại diện (Mongo memory replset)", () => {
  beforeAll(assertMemoryDatabase);

  const service = new UserAvatarService(new PrismaUserRepository(), createAssetLinkService(), createAssetUrlService());
  const app = express();
  app.use(express.json());
  app.use("/api/v1/users", userRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const userIds: string[] = [];
  const tokenOf = (userId: string, role: "user" | "admin" = "user") =>
    JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });

  async function makeUser(status: "ACTIVE" | "ANONYMIZED" = "ACTIVE"): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({
      data: { id, email: `${id}@avatar.test`, name: "Avatar Test", normalizedName: "avatar test", passwordHash: "h", status },
    });
    userIds.push(id);
    return id;
  }

  async function makeAsset(ownerId: string, overrides: { scope?: "AVATAR" | "MESSAGE"; kind?: "IMAGE" | "FILE"; status?: "READY" | "UPLOADING" } = {}): Promise<string> {
    const id = newObjectId();
    await prisma.asset.create({
      data: {
        id,
        ownerId,
        scope: overrides.scope ?? "AVATAR",
        kind: overrides.kind ?? "IMAGE",
        uploadMethod: "API_PUT",
        mime: "image/png",
        declaredSize: 10,
        originalName: "a.png",
        storageKey: `test/avatar/${id}.png`,
        status: overrides.status ?? "READY",
      },
    });
    return id;
  }

  const stateOf = async (userId: string) => ({
    avatarAssetId: (await prisma.user.findUnique({ where: { id: userId }, select: { avatarAssetId: true } }))?.avatarAssetId ?? null,
    links: await prisma.assetLink.findMany({ where: { targetType: "USER_AVATAR", targetId: userId } }),
  });

  beforeEach(() => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    (redis.get as jest.Mock).mockResolvedValue(null);
  });

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { targetType: "USER_AVATAR", targetId: { in: userIds } } });
    await prisma.asset.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  });

  describe("UserAvatarService.set", () => {
    it("đặt ảnh của chính mình: ghi User.avatarAssetId + AssetLink(USER_AVATAR, scope USER) trong cùng transaction", async () => {
      const me = await makeUser();
      const asset = await makeAsset(me);

      await service.set({ id: me }, me, asset);

      const state = await stateOf(me);
      expect(state.avatarAssetId).toBe(asset);
      expect(state.links).toHaveLength(1);
      expect(state.links[0]).toMatchObject({ assetId: asset, targetType: "USER_AVATAR", targetId: me, scopeType: "USER", scopeId: me, createdBy: me });
    });

    it("đặt lại ảnh khác: thay link (chỉ còn 1), asset cũ vào hạn dọn (lastUnlinkedAt)", async () => {
      const me = await makeUser();
      const first = await makeAsset(me);
      const second = await makeAsset(me);
      await service.set({ id: me }, me, first);

      await service.set({ id: me }, me, second);

      const state = await stateOf(me);
      expect(state.avatarAssetId).toBe(second);
      expect(state.links.map((l) => l.assetId)).toEqual([second]);
      const old = await prisma.asset.findUnique({ where: { id: first }, select: { lastUnlinkedAt: true } });
      expect(old?.lastUnlinkedAt).toBeInstanceOf(Date);
    });

    it("gỡ ảnh (null): chính chủ gỡ được; quản trị (actor khác) gỡ hộ được — link biến mất, avatarAssetId = null", async () => {
      const me = await makeUser();
      const asset = await makeAsset(me);
      await service.set({ id: me }, me, asset);
      await service.set({ id: me }, me, null);
      expect(await stateOf(me)).toMatchObject({ avatarAssetId: null, links: [] });

      await service.set({ id: me }, me, asset);
      await service.set({ id: newObjectId() }, me, null); // gỡ ảnh vi phạm (route đã kiểm `user:update`)
      expect(await stateOf(me)).toMatchObject({ avatarAssetId: null, links: [] });
    });

    it("quản trị KHÔNG đặt hộ ảnh cho người khác (403), kể cả asset của chính quản trị — không đổi gì", async () => {
      const target = await makeUser();
      const admin = await makeUser();
      const adminAsset = await makeAsset(admin);

      await expect(service.set({ id: admin }, target, adminAsset)).rejects.toMatchObject({ statusCode: 403 });

      expect(await stateOf(target)).toMatchObject({ avatarAssetId: null, links: [] });
    });

    it("SEC-12 (CHƯA CHỐT — khoá hành vi HIỆN TẠI): asset của NGƯỜI KHÁC → 403 ASSET_005 (không phải 404), ảnh cũ còn nguyên (rollback)", async () => {
      const me = await makeUser();
      const stranger = await makeUser();
      const mine = await makeAsset(me);
      const strangers = await makeAsset(stranger);
      await service.set({ id: me }, me, mine);

      await expect(service.set({ id: me }, me, strangers)).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_005" });

      const state = await stateOf(me);
      expect(state.avatarAssetId).toBe(mine);
      expect(state.links.map((l) => l.assetId)).toEqual([mine]); // `replace` gỡ link cũ TRƯỚC khi `attach` ném lỗi — transaction phải hoàn tác
      expect(await prisma.assetLink.count({ where: { assetId: strangers } })).toBe(0);
    });

    it("SEC-12 (khoá hành vi hiện tại): asset KHÔNG tồn tại → 404, ảnh cũ còn nguyên — hai mã khác nhau (403 vs 404) là cái SEC-12 muốn gộp", async () => {
      const me = await makeUser();
      const mine = await makeAsset(me);
      await service.set({ id: me }, me, mine);

      await expect(service.set({ id: me }, me, newObjectId())).rejects.toMatchObject({ statusCode: 404 });

      expect((await stateOf(me)).avatarAssetId).toBe(mine);
    });

    it("sai scope (không phải AVATAR) → 415 ASSET_001; chưa READY → 409 ASSET_003; kind không phải IMAGE → 415 ASSET_001; không đổi gì", async () => {
      const me = await makeUser();
      const wrongScope = await makeAsset(me, { scope: "MESSAGE" });
      const notReady = await makeAsset(me, { status: "UPLOADING" });
      const notImage = await makeAsset(me, { kind: "FILE" });

      await expect(service.set({ id: me }, me, wrongScope)).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });
      await expect(service.set({ id: me }, me, notReady)).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_003" });
      await expect(service.set({ id: me }, me, notImage)).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });

      expect(await stateOf(me)).toMatchObject({ avatarAssetId: null, links: [] });
    });

    it("tài khoản không tồn tại / đã ẩn danh → 404", async () => {
      const ghost = newObjectId();
      await expect(service.set({ id: ghost }, ghost, null)).rejects.toMatchObject({ statusCode: 404 });

      const anonymized = await makeUser("ANONYMIZED");
      await expect(service.set({ id: anonymized }, anonymized, null)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("HTTP — PATCH /users/:id + GET /users/:id/avatar", () => {
    const patch = (actor: string, targetId: string, body: Record<string, unknown>, role: "user" | "admin" = "user") =>
      request(app).patch(`/api/v1/users/${targetId}`).set("Authorization", `Bearer ${tokenOf(actor, role)}`).send(body);
    const getAvatar = (viewer: string, ownerId: string) =>
      request(app).get(`/api/v1/users/${ownerId}/avatar`).set("Authorization", `Bearer ${tokenOf(viewer)}`).redirects(0);

    it("chính chủ đặt ảnh → 200; người khác đăng nhập GET → 302 tới URL ký, Cache-Control private ngắn hơn TTL", async () => {
      const me = await makeUser();
      const viewer = await makeUser();
      const asset = await makeAsset(me);

      const res = await patch(me, me, { avatarAssetId: asset });
      expect(res.status).toBe(200);
      expect((await stateOf(me)).avatarAssetId).toBe(asset);

      const redirect = await getAvatar(viewer, me);
      expect(redirect.status).toBe(302);
      expect(redirect.headers["cache-control"]).toBe("private, max-age=3000");
      expect(redirect.headers.location).toEqual(expect.any(String));
      expect(redirect.headers.location).not.toBe("");
    });

    it("chưa đặt ảnh → GET 404; không có người dùng → 404; chưa đăng nhập → 401", async () => {
      const me = await makeUser();

      expect((await getAvatar(me, me)).status).toBe(404);
      expect((await getAvatar(me, newObjectId())).status).toBe(404);
      expect((await request(app).get(`/api/v1/users/${me}/avatar`).redirects(0)).status).toBe(401);
    });

    it("gỡ ảnh (null) → GET trở lại 404", async () => {
      const me = await makeUser();
      const asset = await makeAsset(me);
      await patch(me, me, { avatarAssetId: asset });

      const res = await patch(me, me, { avatarAssetId: null });

      expect(res.status).toBe(200);
      expect((await getAvatar(me, me)).status).toBe(404);
    });

    it("SEC-12 qua HTTP (khoá hành vi hiện tại): dùng asset của NGƯỜI KHÁC → 403 ASSET_005, ảnh không đổi", async () => {
      const me = await makeUser();
      const stranger = await makeUser();
      const strangers = await makeAsset(stranger);

      const res = await patch(me, me, { avatarAssetId: strangers });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("ASSET_005");
      expect(await stateOf(me)).toMatchObject({ avatarAssetId: null, links: [] });
    });

    it("đặt ảnh cho NGƯỜI KHÁC: người thường bị chặn ở route (403); quản trị có user:update cũng không đặt hộ được (403), nhưng gỡ hộ được", async () => {
      const target = await makeUser();
      const other = await makeUser();
      const admin = await makeUser();
      const targetAsset = await makeAsset(target);
      const adminAsset = await makeAsset(admin);
      await patch(target, target, { avatarAssetId: targetAsset });

      expect((await patch(other, target, { avatarAssetId: null })).status).toBe(403);
      expect((await patch(admin, target, { avatarAssetId: adminAsset }, "admin")).status).toBe(403);
      expect((await stateOf(target)).avatarAssetId).toBe(targetAsset);

      expect((await patch(admin, target, { avatarAssetId: null }, "admin")).status).toBe(200);
      expect(await stateOf(target)).toMatchObject({ avatarAssetId: null, links: [] });
    });

    it("avatarAssetId không phải ObjectId → 400 (validate trước khi chạm DB)", async () => {
      const me = await makeUser();
      expect((await patch(me, me, { avatarAssetId: "khong-phai-objectid" })).status).toBe(400);
    });
  });

  describe("HTTP — POST /users/:id/avatar/remove (quản trị gỡ ảnh vi phạm, cùng router mount ở /admin/users)", () => {
    const REASON = "Ảnh đại diện vi phạm tiêu chuẩn cộng đồng";
    const removeAvatar = (actor: string, targetId: string, role: string, body: Record<string, unknown> = { reason: REASON }) =>
      request(app)
        .post(`/api/v1/users/${targetId}/avatar/remove`)
        .set("Authorization", `Bearer ${JwtUtils.generateAccessToken({ userId: actor, email: `${actor}@e.com`, name: "T", role, sv: 1 })}`)
        .send(body);

    it("thiếu quyền user:update (user, manager) → 403, ảnh còn nguyên", async () => {
      const target = await makeUser();
      const asset = await makeAsset(target);
      await service.set({ id: target }, target, asset);

      expect((await removeAvatar(await makeUser(), target, "user")).status).toBe(403);
      expect((await removeAvatar(await makeUser(), target, "manager")).status).toBe(403);
      expect((await removeAvatar(target, target, "user")).status).toBe(403); // chính chủ cũng không dùng route quản trị (gỡ bằng PATCH)
      expect((await stateOf(target)).avatarAssetId).toBe(asset);
    });

    it("admin (có user:update) → 200 { removed:true, user } — link gỡ, avatarAssetId/avatarUrl null, audit user.avatar-remove kèm lý do", async () => {
      const target = await makeUser();
      const admin = await makeUser();
      const asset = await makeAsset(target);
      await service.set({ id: target }, target, asset);

      const res = await removeAvatar(admin, target, "admin");

      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
      expect(res.body.data.user).toMatchObject({ id: target, avatarAssetId: null, avatarUrl: null });
      expect(res.body.data.user).not.toHaveProperty("passwordHash");
      expect(await stateOf(target)).toMatchObject({ avatarAssetId: null, links: [] });
      const audit = await prisma.auditLog.findFirst({ where: { action: "user.avatar-remove", targetId: target } });
      expect(audit).toMatchObject({ actorId: admin, targetType: "User", reason: REASON });
      await prisma.auditLog.deleteMany({ where: { targetId: target } });
    });

    it("chưa có ảnh → 200 { removed:false }, không ghi audit; lý do thiếu/ngắn → 400; id sai → 400; không có / đã ẩn danh → 404", async () => {
      const admin = await makeUser();
      const plain = await makeUser();

      const noAvatar = await removeAvatar(admin, plain, "admin");
      expect(noAvatar.status).toBe(200);
      expect(noAvatar.body.data).toMatchObject({ removed: false, user: { id: plain, avatarUrl: null } });
      expect(await prisma.auditLog.count({ where: { action: "user.avatar-remove", targetId: plain } })).toBe(0);

      expect((await removeAvatar(admin, plain, "admin", {})).status).toBe(400);
      expect((await removeAvatar(admin, plain, "admin", { reason: "ngắn" })).status).toBe(400);
      expect((await removeAvatar(admin, "khong-phai-id", "admin")).status).toBe(400);
      expect((await removeAvatar(admin, newObjectId(), "admin")).status).toBe(404);
      expect((await removeAvatar(admin, await makeUser("ANONYMIZED"), "admin")).status).toBe(404);
    });
  });

  describe("ẩn danh hoá (SEC-10) gỡ ảnh đại diện", () => {
    it("UserAnonymizer gỡ AssetLink(USER_AVATAR) + avatarAssetId = null; GET /users/:id/avatar → 404; asset vào hạn dọn", async () => {
      const me = await makeUser();
      const viewer = await makeUser();
      const asset = await makeAsset(me);
      await service.set({ id: me }, me, asset);

      await new UserAnonymizer().anonymize(me);

      expect(await stateOf(me)).toMatchObject({ avatarAssetId: null, links: [] });
      const res = await request(app).get(`/api/v1/users/${me}/avatar`).set("Authorization", `Bearer ${tokenOf(viewer)}`).redirects(0);
      expect(res.status).toBe(404);
      const row = await prisma.asset.findUnique({ where: { id: asset }, select: { lastUnlinkedAt: true } });
      expect(row?.lastUnlinkedAt).toBeInstanceOf(Date);
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: me } });
    });
  });
});
