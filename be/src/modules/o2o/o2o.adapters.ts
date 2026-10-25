import type { AuthUser } from "../../core/types/express";
import { permissionService } from "../../core/permission";
import { invalidateDataPermissions } from "../../core/permission/data-permissions";
import { storage } from "../../infrastructure/storage";
import { createAssetLifecycleService, createAssetLinkService, createAssetUrlService } from "../assets/public";
import { notify, type NotifyInput } from "../notifications/public";
import type { TxHandle } from "./repositories/tx";
import type { IDataPermissionCache, IO2oAccess, IO2oAssetPort, IO2oNotifier, O2oAssetInfo, SignedUrl } from "./services/o2o.deps";

/** Cổng asset thật — CHỈ qua `@modules/assets/public` (không import file nội bộ của `assets`) + `storage` hạ tầng. */
export class PublicAssetsAdapter implements IO2oAssetPort {
  private readonly lifecycle = createAssetLifecycleService();
  private readonly links = createAssetLinkService();
  private readonly urls = createAssetUrlService();

  async get(assetId: string): Promise<O2oAssetInfo | null> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) return null;
    const a = found.asset;
    return { id: a.id, ownerId: a.ownerId, status: a.status, scope: a.scope, kind: a.kind, mime: a.mime, size: a.size, storageKey: a.storageKey, originalName: a.originalName };
  }

  async read(asset: O2oAssetInfo): Promise<Buffer> {
    if (!asset.size || asset.size <= 0) return Buffer.alloc(0);
    return storage.readRange(asset.storageKey, 0, asset.size - 1);
  }

  async attach(
    tx: TxHandle,
    input: { assetIds: string[]; targetType: "PRINT_ORDER" | "LOCATION_PHOTO"; targetId: string; scopeType: "NONE" | "USER"; actorId: string; foreign?: boolean }
  ): Promise<void> {
    await this.links.attach(tx, {
      assetIds: input.assetIds,
      targetType: input.targetType,
      targetId: input.targetId,
      scopeType: input.scopeType,
      actorId: input.actorId,
      allowForeignReadable: input.foreign === true,
    });
  }

  async detach(tx: TxHandle, input: { targetType: "PRINT_ORDER" | "LOCATION_PHOTO"; targetId: string; assetIds?: string[] }): Promise<void> {
    await this.links.detach(tx, input);
  }

  signedUrl(assetId: string, user: AuthUser, disposition: "inline" | "attachment"): Promise<SignedUrl> {
    return this.urls.getUrl(assetId, user, { variant: "ORIGINAL", disposition });
  }

  async signPhotos(assetIds: string[], user: AuthUser) {
    if (assetIds.length === 0) return [];
    const thumbs = await this.urls.signThumbnails(assetIds);
    return Promise.all(
      assetIds.map(async (assetId) => {
        const full = await this.urls.getUrl(assetId, user, { variant: "ORIGINAL", disposition: "inline" }).catch(() => null);
        const thumb = thumbs.get(assetId);
        return { assetId, url: full?.url ?? null, thumbUrl: thumb?.url ?? full?.url ?? null, expiresAt: full?.expiresAt ?? thumb?.expiresAt ?? null };
      })
    );
  }
}

/** Quyền đọc tài liệu Resource Hub = `workspace.resource.read` (GUEST ngoài kênh/người ngoài nhóm → false). */
export class PermissionResourceAccess implements IO2oAccess {
  canReadResource(user: AuthUser, workspaceId: string): Promise<boolean> {
    return permissionService.can(user, "workspace.resource.read", { type: "WORKSPACE", id: workspaceId });
  }
}

export class NotifyAdapter implements IO2oNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }
}

export class DataPermissionCacheAdapter implements IDataPermissionCache {
  invalidate(userId: string): Promise<void> {
    return invalidateDataPermissions(userId);
  }
}
