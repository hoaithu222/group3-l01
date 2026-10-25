import { storage } from "../../../infrastructure/storage";
import { createAssetLifecycleService } from "../../assets/public";

/**
 * Đọc nội dung `Asset` gốc của một `Resource` — CHỈ qua `@modules/assets/public` + `storage` hạ tầng (không import file
 * nội bộ của `assets`/`resources`), cùng mẫu `o2o/o2o.adapters.ts#PublicAssetsAdapter.read`.
 */
export interface IPlagiarismAssetReader {
  /** `null` khi asset không còn/không sẵn sàng (READY). */
  read(assetId: string): Promise<{ buffer: Buffer; size: number } | null>;
}

export class PublicPlagiarismAssetReader implements IPlagiarismAssetReader {
  private readonly lifecycle = createAssetLifecycleService();

  async read(assetId: string): Promise<{ buffer: Buffer; size: number } | null> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found || found.asset.status !== "READY" || !found.asset.size || found.asset.size <= 0) return null;
    const buffer = await storage.readRange(found.asset.storageKey, 0, found.asset.size - 1);
    return { buffer, size: found.asset.size };
  }
}
