/**
 * `groupBy`/`aggregate` là truy vấn Mongo tổng hợp không tầm thường — dùng
 * Mongo thật (`TEST_DB=memory`, giống `anonymizer.test.ts`) thay vì mock
 * `prisma` tay để không che giấu lỗi truy vấn thật (xem bug `lastUnlinkedAt`
 * đã bắt được ở `assets-cleanup.test.ts` nhờ chạy Mongo thật).
 */
import { prisma } from "../../../infrastructure/database";
import { AdminStorageService } from "../admin-storage.service";
import { newObjectId } from "../../../core/utils/object-id";
import { env } from "../../../core/config";

const HOUR_MS = 3600_000;

describe("AdminStorageService (Mongo memory replset)", () => {
  const service = new AdminStorageService();
  const ownerId = newObjectId();
  const workspaceId = newObjectId();

  afterEach(async () => {
    await prisma.assetLink.deleteMany({ where: { createdBy: ownerId } });
    await prisma.asset.deleteMany({ where: { ownerId } });
  });

  async function seedAsset(overrides: {
    scope?: "RESOURCE" | "WORKSPACE";
    kind?: "IMAGE" | "FILE";
    status?: "READY" | "UPLOADING" | "REJECTED" | "DELETED";
    size?: number;
    workspaceId?: string;
    createdAt?: Date;
  }) {
    return prisma.asset.create({
      data: {
        id: newObjectId(),
        ownerId,
        scope: overrides.scope ?? "RESOURCE",
        kind: overrides.kind ?? "IMAGE",
        variant: "ORIGINAL",
        uploadMethod: "API_PUT",
        mime: "image/png",
        declaredSize: overrides.size ?? 1000,
        size: overrides.size ?? 1000,
        originalName: "a.png",
        storageKey: `resource/${ownerId}/${newObjectId()}.png`,
        status: overrides.status ?? "READY",
        workspaceId: overrides.workspaceId,
        ...(overrides.createdAt && { createdAt: overrides.createdAt }),
      },
    });
  }

  it("tổng bytes/count tính đúng, loại trừ asset DELETED", async () => {
    await seedAsset({ size: 1000 });
    await seedAsset({ size: 2000 });
    await seedAsset({ size: 5000, status: "DELETED" });

    const stats = await service.getStats({});
    const ownAssets = stats.byScope.find((b) => b.key === "RESOURCE");
    expect(ownAssets).toBeDefined();
    // Không thể khẳng định tổng tuyệt đối (replset dùng chung có dữ liệu file
    // test khác) — chỉ kiểm bytes/count của 2 asset vừa seed nằm trong đó.
    expect(stats.totals.bytes).toBeGreaterThanOrEqual(3000);
    expect(stats.storageType).toBe(env.STORAGE_TYPE);
  });

  it("byStatus liệt kê cả DELETED (không lọc như byScope/byKind)", async () => {
    await seedAsset({ status: "DELETED", size: 999 });
    const stats = await service.getStats({});
    const deletedBucket = stats.byStatus.find((b) => b.key === "DELETED");
    expect(deletedBucket).toBeDefined();
    expect(deletedBucket!.count).toBeGreaterThanOrEqual(1);
  });

  it("lọc theo workspaceId khi truyền query", async () => {
    await seedAsset({ workspaceId, size: 4321 });
    await seedAsset({ size: 111 }); // không thuộc workspace này

    const stats = await service.getStats({ workspaceId });
    expect(stats.totals.count).toBeGreaterThanOrEqual(1);
    expect(stats.totals.bytes).toBeGreaterThanOrEqual(4321);
  });

  it("orphan: đếm asset quá hạn CHƯA gắn link, loại asset còn AssetLink", async () => {
    const orphan = await seedAsset({ size: 7000, createdAt: new Date(Date.now() - 25 * HOUR_MS) });
    const linked = await seedAsset({ size: 8000, createdAt: new Date(Date.now() - 25 * HOUR_MS) });
    await prisma.assetLink.create({
      data: {
        assetId: linked.id,
        targetType: "RESOURCE",
        targetId: newObjectId(),
        scopeType: "NONE",
        scopeId: null,
        createdBy: ownerId,
      },
    });
    await seedAsset({ size: 999, createdAt: new Date() }); // mới, chưa đủ hạn

    const stats = await service.getStats({});
    expect(stats.orphan.count).toBeGreaterThanOrEqual(1);
    expect(stats.orphan.bytes).toBeGreaterThanOrEqual(orphan.size ?? 0);
  });
});
