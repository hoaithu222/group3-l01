import type { TxHandle } from "../repositories/tx";

export type RoadmapAssetTarget = "ROADMAP_SUBJECT_COVER" | "ROADMAP_LESSON";

/** Phần `Asset` module cần để kiểm trước khi gắn (không kéo cả entity của `assets` vào module này) — mẫu `study/services/study-asset.port.ts`. */
export interface RoadmapAssetInfo {
  id: string;
  ownerId: string;
  scope: string;
  variant: string;
  kind: string;
  status: string;
}

/** Cổng sang module `assets` (chỉ qua `@modules/assets/public`) — kiểm asset trước khi gắn, gắn/gỡ `AssetLink`. */
export interface IRoadmapAssetPort {
  get(assetId: string): Promise<{ asset: RoadmapAssetInfo; linked: boolean } | null>;
  attach(tx: TxHandle, args: { assetIds: string[]; targetType: RoadmapAssetTarget; targetId: string; actorId: string }): Promise<void>;
  detach(tx: TxHandle, args: { targetType: RoadmapAssetTarget; targetId: string; assetIds?: string[] }): Promise<void>;
}
