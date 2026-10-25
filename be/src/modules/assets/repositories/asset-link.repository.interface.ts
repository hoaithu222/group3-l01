import type { AssetLink, AssetLinkTargetType } from "../entities/asset.interface";

/**
 * Đọc `AssetLink` — CHỈ đọc. Ghi (`attach`/`detach`/`replace`/`detachAll`)
 * thuộc về `AssetLinkService`, luôn chạy trong `Prisma.TransactionClient` do
 * module gọi truyền vào (be.md §5.5) — đi thẳng `tx.assetLink.*`, KHÔNG qua
 * repo này (giống `UserAnonymizer`/`UserService.requestDeletion` đã làm cho
 * thao tác xuyên collection cần tx, xem comment ở `asset-link.service.ts`).
 */
export interface IAssetLinkRepository {
  /** Toàn bộ link của 1 asset — `AssetAccessService.canRead` dùng để suy quyền đọc. */
  listByAsset(assetId: string, limit?: number): Promise<AssetLink[]>;
  listByTarget(targetType: AssetLinkTargetType, targetId: string): Promise<AssetLink[]>;
  /** Asset còn gắn vào ít nhất 1 đối tượng — `assets.cleanup` dùng để loại khỏi lô xoá. */
  existsForAsset(assetId: string): Promise<boolean>;
}
