/**
 * Integration — `AssetLinkService` (be.md §5.5) chạy trong `Prisma.TransactionClient`
 * thật (`withTransaction`, Mongo memory replset) — không mock `prisma`/`tx`,
 * đúng bản chất "module gọi tự mở transaction rồi truyền `tx` vào" của service này.
 */
import { prisma, withTransaction } from "../../../../infrastructure/database";
import { AssetLinkService } from "../../services/asset-link.service";
import { AssetAccessService } from "../../services/asset-access.service";
import { PrismaAssetLinkRepository } from "../../repositories/asset-link.repository.prisma";
import { PrismaAssetRepository } from "../../repositories/asset.repository.prisma";
import { newObjectId } from "../../../../core/utils/object-id";
import type { AssetCreateInput } from "../../entities/asset.interface";

describe("AssetLinkService (integration — Mongo memory replset)", () => {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  const access = new AssetAccessService(linkRepo);
  const service = new AssetLinkService(access);
  const owner = newObjectId();
  const stranger = newObjectId();

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { createdBy: { in: [owner, stranger] } } });
    await prisma.asset.deleteMany({ where: { ownerId: { in: [owner, stranger] } } });
  });

  async function createAsset(overrides: Partial<AssetCreateInput> = {}) {
    const input: AssetCreateInput = {
      id: newObjectId(),
      ownerId: owner,
      scope: "MESSAGE",
      kind: "IMAGE",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 10,
      originalName: "a.png",
      storageKey: `resource/${owner}/${newObjectId()}.png`,
      status: "READY",
      ...overrides,
    };
    return repo.create(input);
  }

  describe("attach()", () => {
    it("gắn asset READY thuộc chủ vào target — idempotent (gọi lại 2 lần không nhân bản)", async () => {
      const asset = await createAsset();
      const messageId = newObjectId();

      for (let i = 0; i < 2; i += 1) {
        await withTransaction((tx) =>
          service.attach(tx, {
            assetIds: [asset.id],
            targetType: "MESSAGE",
            targetId: messageId,
            scopeType: "NONE",
            actorId: owner,
          })
        );
      }

      const links = await prisma.assetLink.findMany({ where: { assetId: asset.id, targetType: "MESSAGE", targetId: messageId } });
      expect(links).toHaveLength(1);
    });

    it("ASSET_003 khi asset chưa READY", async () => {
      const asset = await createAsset({ status: "UPLOADING" });
      await expect(
        withTransaction((tx) =>
          service.attach(tx, {
            assetIds: [asset.id],
            targetType: "MESSAGE",
            targetId: newObjectId(),
            scopeType: "NONE",
            actorId: owner,
          })
        )
      ).rejects.toMatchObject({ statusCode: 409, errorCode: "ASSET_003" });
    });

    it("ASSET_005 khi asset không thuộc actor và KHÔNG cho allowForeignReadable", async () => {
      const asset = await createAsset();
      await expect(
        withTransaction((tx) =>
          service.attach(tx, {
            assetIds: [asset.id],
            targetType: "MESSAGE",
            targetId: newObjectId(),
            scopeType: "NONE",
            actorId: stranger,
          })
        )
      ).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_005" });
    });

    it("allowForeignReadable=true cho phép chuyển tiếp khi actor ĐỌC ĐƯỢC asset (đã gắn, chủ cũ đọc được)", async () => {
      const asset = await createAsset();
      // stranger đọc được asset qua 1 link cũ scopeType NONE... nhưng NONE chỉ chủ đọc được theo canRead — đổi
      // sang minh hoạ đúng: gắn trước 1 link scopeType USER (mọi user đăng nhập đọc được) rồi forward.
      await prisma.assetLink.create({
        data: { assetId: asset.id, targetType: "USER_AVATAR", targetId: owner, scopeType: "USER", scopeId: null, createdBy: owner },
      });

      await withTransaction((tx) =>
        service.attach(tx, {
          assetIds: [asset.id],
          targetType: "MESSAGE",
          targetId: newObjectId(),
          scopeType: "NONE",
          actorId: stranger,
          allowForeignReadable: true,
        })
      );

      const links = await prisma.assetLink.findMany({ where: { assetId: asset.id } });
      expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it("ASSET_001 khi kind không hợp lệ cho target chỉ nhận IMAGE (vd USER_AVATAR)", async () => {
      const asset = await createAsset({ kind: "VIDEO", mime: "video/mp4" });
      await expect(
        withTransaction((tx) =>
          service.attach(tx, {
            assetIds: [asset.id],
            targetType: "USER_AVATAR",
            targetId: owner,
            scopeType: "USER",
            actorId: owner,
          })
        )
      ).rejects.toMatchObject({ statusCode: 415, errorCode: "ASSET_001" });
    });
  });

  describe("detach() / detachAll()", () => {
    it("gỡ asset khỏi target — set lastUnlinkedAt", async () => {
      const asset = await createAsset();
      const targetId = newObjectId();
      await withTransaction((tx) =>
        service.attach(tx, { assetIds: [asset.id], targetType: "TASK", targetId, scopeType: "NONE", actorId: owner })
      );

      await withTransaction((tx) => service.detach(tx, { targetType: "TASK", targetId }));

      const links = await prisma.assetLink.findMany({ where: { assetId: asset.id } });
      expect(links).toHaveLength(0);
      const reloaded = await repo.findById(asset.id);
      expect(reloaded?.lastUnlinkedAt).not.toBeNull();
    });

    it("detachAll gỡ MỌI asset đang gắn vào 1 target", async () => {
      const a1 = await createAsset();
      const a2 = await createAsset();
      const targetId = newObjectId();
      await withTransaction((tx) =>
        service.attach(tx, {
          assetIds: [a1.id, a2.id],
          targetType: "MEETING_RECAP",
          targetId,
          scopeType: "NONE",
          actorId: owner,
        })
      );

      await withTransaction((tx) => service.detachAll(tx, { targetType: "MEETING_RECAP", targetId }));

      const links = await prisma.assetLink.findMany({ where: { targetType: "MEETING_RECAP", targetId } });
      expect(links).toHaveLength(0);
    });
  });

  describe("replace()", () => {
    it("thay asset avatar cũ bằng asset mới — chỉ còn 1 link cho target", async () => {
      const old = await createAsset();
      const next = await createAsset();
      const targetId = owner; // USER_AVATAR targetId = userId

      await withTransaction((tx) =>
        service.attach(tx, {
          assetIds: [old.id],
          targetType: "USER_AVATAR",
          targetId,
          scopeType: "USER",
          actorId: owner,
        })
      );
      await withTransaction((tx) =>
        service.replace(tx, {
          targetType: "USER_AVATAR",
          targetId,
          assetId: next.id,
          scopeType: "USER",
          actorId: owner,
        })
      );

      const links = await prisma.assetLink.findMany({ where: { targetType: "USER_AVATAR", targetId } });
      expect(links).toHaveLength(1);
      expect(links[0]?.assetId).toBe(next.id);
    });
  });
});
