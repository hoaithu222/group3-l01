import {
  createAssetLifecycleService,
  createAssetLinkService,
  createAssetUrlService,
  type AssetLifecycleService,
  type AssetLinkService,
  type AssetUrlPort,
} from "../../assets/public";
import type { AuthUser } from "../../../core/types/express";
import type { TxHandle } from "../repositories/tx";
import type { IAssetPort } from "./asset-port";

/** Cài đặt thật của `IAssetPort` — CHỈ đi qua `@modules/assets/public` (không import file nội bộ của `assets`). */
export class PublicAssetPort implements IAssetPort {
  constructor(
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly links: AssetLinkService = createAssetLinkService(),
    private readonly urls: AssetUrlPort = createAssetUrlService()
  ) {}

  getForAttach(assetId: string) {
    return this.lifecycle.getForAttach(assetId);
  }

  attach(tx: TxHandle, args: { assetId: string; resourceId: string; workspaceId: string; actorId: string; allowForeignReadable?: boolean }): Promise<void> {
    return this.links.attach(tx, {
      assetIds: [args.assetId],
      targetType: "RESOURCE",
      targetId: args.resourceId,
      scopeType: "WORKSPACE",
      scopeId: args.workspaceId,
      actorId: args.actorId,
      allowForeignReadable: args.allowForeignReadable,
    });
  }

  detach(tx: TxHandle, resourceId: string): Promise<void> {
    return this.links.detachAll(tx, { targetType: "RESOURCE", targetId: resourceId });
  }

  markDeleted(tx: TxHandle, assetId: string): Promise<void> {
    return this.lifecycle.markDeleted(tx, assetId);
  }

  storageKeysOf(assetId: string): Promise<string[]> {
    return this.lifecycle.storageKeysOf(assetId);
  }

  deleteObjects(keys: string[]): Promise<void> {
    return this.lifecycle.deleteObjects(keys);
  }

  getUrl(assetId: string, user: AuthUser, disposition: "inline" | "attachment") {
    return this.urls.getUrl(assetId, user, { variant: "ORIGINAL", disposition });
  }

  signThumbnails(assetIds: string[]) {
    return this.urls.signThumbnails(assetIds);
  }
}
