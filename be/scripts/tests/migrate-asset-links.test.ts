/**
 * Mongo thật (`TEST_DB=memory`) — script đọc/ghi `Asset.attachedType/attachedId`
 * cũ và `AssetLink` mới, cần hành vi Mongo thật (unique constraint) để xác
 * nhận idempotent đúng nghĩa.
 */
import { prisma } from "../../src/infrastructure/database";
import { newObjectId } from "../../src/core/utils/object-id";
import { migrateAssetLinks } from "../migrate-asset-links";

describe("migrate-asset-links (Mongo memory replset)", () => {
  const ownerId = newObjectId();

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { createdBy: ownerId } });
    await prisma.asset.deleteMany({ where: { ownerId } });
  });

  async function seedLegacyAsset(attachedType: string, attachedId: string) {
    return prisma.asset.create({
      data: {
        id: newObjectId(),
        ownerId,
        scope: "MESSAGE",
        kind: "IMAGE",
        variant: "ORIGINAL",
        uploadMethod: "API_PUT",
        mime: "image/png",
        declaredSize: 10,
        size: 10,
        originalName: "a.png",
        storageKey: `resource/${ownerId}/${newObjectId()}.png`,
        status: "READY",
        attachedType,
        attachedId,
      },
    });
  }

  it("tạo AssetLink từ Asset.attachedType/attachedId cũ (targetType khớp enum)", async () => {
    const targetId = newObjectId();
    const asset = await seedLegacyAsset("message", targetId);

    const result = await migrateAssetLinks();
    expect(result.migrated).toBeGreaterThanOrEqual(1);

    const link = await prisma.assetLink.findUnique({
      where: { assetId_targetType_targetId: { assetId: asset.id, targetType: "MESSAGE", targetId } },
    });
    expect(link).not.toBeNull();
    expect(link?.scopeType).toBe("NONE");
    expect(link?.createdBy).toBe(ownerId);
  });

  it("attachedType lạ (không khớp AssetLinkTarget) → rơi vào OTHER", async () => {
    const targetId = newObjectId();
    const asset = await seedLegacyAsset("SomeLegacyThing", targetId);

    await migrateAssetLinks();

    const link = await prisma.assetLink.findUnique({
      where: { assetId_targetType_targetId: { assetId: asset.id, targetType: "OTHER", targetId } },
    });
    expect(link).not.toBeNull();
  });

  it("idempotent — chạy 2 lần KHÔNG tạo AssetLink trùng", async () => {
    const targetId = newObjectId();
    await seedLegacyAsset("task", targetId);

    const first = await migrateAssetLinks();
    expect(first.migrated).toBeGreaterThanOrEqual(1);

    const second = await migrateAssetLinks();
    expect(second.migrated).toBe(0);
    expect(second.skippedExisting).toBeGreaterThanOrEqual(1);

    const count = await prisma.assetLink.count({ where: { createdBy: ownerId } });
    expect(count).toBe(1);
  });

  it("asset không có attachedType/attachedId bị bỏ qua hoàn toàn (không quét)", async () => {
    await prisma.asset.create({
      data: {
        id: newObjectId(),
        ownerId,
        scope: "MESSAGE",
        kind: "IMAGE",
        uploadMethod: "API_PUT",
        mime: "image/png",
        declaredSize: 10,
        originalName: "b.png",
        storageKey: `resource/${ownerId}/${newObjectId()}.png`,
        status: "READY",
      },
    });

    const result = await migrateAssetLinks();
    const links = await prisma.assetLink.count({ where: { createdBy: ownerId } });
    expect(links).toBe(0);
    expect(result.scanned).toBeGreaterThanOrEqual(0);
  });
});
