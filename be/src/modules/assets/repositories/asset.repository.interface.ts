import type { Asset, AssetCreateInput, AssetUpdateInput } from "../entities/asset.interface";

export interface IAssetRepository {
  findById(id: string): Promise<Asset | null>;
  findByIds(ids: string[]): Promise<Asset[]>;
  /** Asset con (variant THUMB/POSTER) của 1 asset gốc — dùng cho URL/cleanup. */
  findChildren(parentAssetId: string): Promise<Asset[]>;
  create(input: AssetCreateInput): Promise<Asset>;
  update(id: string, input: AssetUpdateInput): Promise<Asset | null>;
  /**
   * CAS nhẹ (be.md §5.3 bước 1) — xác nhận asset còn đúng `PROCESSING` trước
   * khi `asset-processor` xử lý; `false` → job khác đã xử lý xong/asset đã
   * đổi trạng thái, bỏ qua (idempotent).
   */
  claimForProcessing(id: string): Promise<boolean>;
  /** Chuyển `DELETED` + `deletedAt` — dùng bởi xoá thủ công (chủ) và `assets.cleanup`. */
  markDeleted(id: string): Promise<Asset | null>;
  /**
   * Ứng viên dọn `assets.cleanup` (be.md §5.7) — asset gốc (`variant ORIGINAL`)
   * đã quá `olderThan` tính từ `coalesce(lastUnlinkedAt, createdAt)`. KHÔNG
   * lọc theo `AssetLink` ở đây (job tự kiểm bằng `assetLinkRepo.existsForAsset`).
   */
  findCleanupCandidates(olderThan: Date, limit: number): Promise<Asset[]>;
}
