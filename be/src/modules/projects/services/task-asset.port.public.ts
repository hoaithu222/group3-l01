import {
  createAssetLifecycleService,
  createAssetLinkService,
  createAssetUrlService,
  type AssetLifecycleService,
  type AssetLinkService,
  type AssetUrlPort,
} from "../../assets/public";
import { prismaTx } from "../repositories/prisma-tx";
import type { TxContext } from "../repositories/unit-of-work";
import type { AssetLinkTargetKind, ITaskAssetPort } from "./task-asset.port";

/** Cài đặt thật của `ITaskAssetPort` — CHỈ đi qua `@modules/assets/public` (không import file nội bộ của `assets`). */
export class PublicTaskAssetPort implements ITaskAssetPort {
  constructor(
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly links: AssetLinkService = createAssetLinkService(),
    private readonly urls: AssetUrlPort = createAssetUrlService()
  ) {}

  getForAttach(assetId: string) {
    return this.lifecycle.getForAttach(assetId);
  }

  attach(
    tx: TxContext,
    args: { assetIds: string[]; targetType: AssetLinkTargetKind; targetId: string; workspaceId: string; actorId: string }
  ): Promise<void> {
    return this.links.attach(prismaTx(tx), {
      assetIds: args.assetIds,
      targetType: args.targetType,
      targetId: args.targetId,
      scopeType: "WORKSPACE",
      scopeId: args.workspaceId,
      actorId: args.actorId,
    });
  }

  detach(tx: TxContext, args: { targetType: AssetLinkTargetKind; targetId: string; assetIds?: string[] }): Promise<void> {
    return this.links.detach(prismaTx(tx), args);
  }

  signThumbnails(assetIds: string[]) {
    return this.urls.signThumbnails(assetIds);
  }
}
