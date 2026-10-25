import { newObjectId } from "../../../core/utils/object-id";
import type { IAssetLinkRepository } from "./asset-link.repository.interface";
import type { AssetLink, AssetLinkTargetType } from "../entities/asset.interface";

const store = new Map<string, AssetLink>();

/** In-memory store — dùng cho test (đọc). Ghi trực tiếp qua `store` từ test khi cần seed dữ liệu. */
export class InMemoryAssetLinkRepository implements IAssetLinkRepository {
  static clearStore(): void {
    store.clear();
  }

  static seed(link: Omit<AssetLink, "id" | "createdAt"> & Partial<Pick<AssetLink, "id" | "createdAt">>): AssetLink {
    const full: AssetLink = {
      id: link.id ?? newObjectId(),
      assetId: link.assetId,
      targetType: link.targetType,
      targetId: link.targetId,
      scopeType: link.scopeType,
      scopeId: link.scopeId,
      createdBy: link.createdBy,
      createdAt: link.createdAt ?? new Date(),
    };
    store.set(full.id, full);
    return full;
  }

  async listByAsset(assetId: string, limit = 50): Promise<AssetLink[]> {
    return Array.from(store.values())
      .filter((l) => l.assetId === assetId)
      .slice(0, limit);
  }

  async listByTarget(targetType: AssetLinkTargetType, targetId: string): Promise<AssetLink[]> {
    return Array.from(store.values()).filter((l) => l.targetType === targetType && l.targetId === targetId);
  }

  async existsForAsset(assetId: string): Promise<boolean> {
    return Array.from(store.values()).some((l) => l.assetId === assetId);
  }
}
