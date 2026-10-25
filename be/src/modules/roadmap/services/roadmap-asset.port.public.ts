import { createAssetLifecycleService, createAssetLinkService, type AssetLifecycleService, type AssetLinkService } from "../../assets/public";
import type { TxHandle } from "../repositories/tx";
import type { IRoadmapAssetPort, RoadmapAssetTarget } from "./roadmap-asset.port";

/**
 * Cài đặt thật của `IRoadmapAssetPort` — CHỈ đi qua `@modules/assets/public` (mẫu `study/services/study-asset.port.public.ts`).
 * Link luôn `scopeType NONE`: quyền đọc do resolver `ROADMAP_SUBJECT_COVER`/`ROADMAP_LESSON` (đăng ký ở `roadmap-integrations.ts`)
 * quyết định theo môn/buổi đã xuất bản hay chưa.
 */
export class PublicRoadmapAssetPort implements IRoadmapAssetPort {
  constructor(
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly links: AssetLinkService = createAssetLinkService()
  ) {}

  async get(assetId: string) {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) return null;
    const { id, ownerId, scope, variant, kind, status } = found.asset;
    return { asset: { id, ownerId, scope, variant, kind, status }, linked: found.linked };
  }

  attach(tx: TxHandle, args: { assetIds: string[]; targetType: RoadmapAssetTarget; targetId: string; actorId: string }): Promise<void> {
    return this.links.attach(tx, { assetIds: args.assetIds, targetType: args.targetType, targetId: args.targetId, scopeType: "NONE", actorId: args.actorId });
  }

  detach(tx: TxHandle, args: { targetType: RoadmapAssetTarget; targetId: string; assetIds?: string[] }): Promise<void> {
    return this.links.detach(tx, { targetType: args.targetType, targetId: args.targetId, assetIds: args.assetIds });
  }
}
