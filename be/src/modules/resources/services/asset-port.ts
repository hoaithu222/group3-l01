import type { AuthUser } from "../../../core/types/express";
import type { TxHandle } from "../repositories/tx";

/** Phần `Asset` mà kho tài liệu cần để kiểm trước khi gắn (không kéo cả entity của `assets` vào module này). */
export interface AttachableAsset {
  id: string;
  ownerId: string;
  scope: string;
  variant: string;
  workspaceId: string | null;
  status: string;
  mime: string;
  originalName: string;
  size: number | null;
  declaredSize: number;
  thumbnailAssetId: string | null;
}

/**
 * Cổng sang module `assets` (chỉ qua `@modules/assets/public` — không import file trong `assets/services|repositories`):
 * kiểm asset trước khi tạo Resource, gắn/gỡ `AssetLink { RESOURCE }`, dọn object + đánh dấu `DELETED` khi purge, và
 * ký URL. Test dùng `InMemoryAssetPort` thay vì mock từng hàm.
 */
export interface IAssetPort {
  getForAttach(assetId: string): Promise<{ asset: AttachableAsset; linked: boolean } | null>;
  /**
   * `allowForeignReadable` (p7-04, `resource-creation.port.impl.ts`): nguồn là tệp của tin nhắn ĐÃ kiểm quyền đọc ở nơi
   * gọi — actor không phải chủ asset gốc vẫn gắn được (như chuyển tiếp tin nhắn, `message.service.ts`). Bỏ trống/`false`
   * = hành vi cũ (chỉ chủ asset, luồng tải lên trực tiếp).
   */
  attach(tx: TxHandle, args: { assetId: string; resourceId: string; workspaceId: string; actorId: string; allowForeignReadable?: boolean }): Promise<void>;
  detach(tx: TxHandle, resourceId: string): Promise<void>;
  markDeleted(tx: TxHandle, assetId: string): Promise<void>;
  storageKeysOf(assetId: string): Promise<string[]>;
  deleteObjects(keys: string[]): Promise<void>;
  getUrl(assetId: string, user: AuthUser, disposition: "inline" | "attachment"): Promise<{ url: string; expiresAt: string }>;
  signThumbnails(assetIds: string[]): Promise<Map<string, { url: string; expiresAt: string }>>;
}

/** Test: kho asset trong bộ nhớ + ghi lại các lời gọi để khẳng định (gắn/gỡ/xoá object). */
export class InMemoryAssetPort implements IAssetPort {
  readonly assets = new Map<string, AttachableAsset>();
  readonly links = new Set<string>();
  readonly deletedAssets = new Set<string>();
  readonly deletedKeys: string[] = [];
  failDeleteObjects = false;

  getForAttach(assetId: string) {
    const asset = this.assets.get(assetId);
    return Promise.resolve(asset ? { asset, linked: this.links.has(assetId) } : null);
  }

  attach(_tx: TxHandle, args: { assetId: string }): Promise<void> {
    this.links.add(args.assetId);
    return Promise.resolve();
  }

  detach(): Promise<void> {
    return Promise.resolve();
  }

  markDeleted(_tx: TxHandle, assetId: string): Promise<void> {
    this.deletedAssets.add(assetId);
    this.links.delete(assetId);
    return Promise.resolve();
  }

  storageKeysOf(assetId: string): Promise<string[]> {
    return Promise.resolve([`key/${assetId}`]);
  }

  deleteObjects(keys: string[]): Promise<void> {
    if (this.failDeleteObjects) return Promise.reject(new Error("storage down"));
    this.deletedKeys.push(...keys);
    return Promise.resolve();
  }

  getUrl(assetId: string): Promise<{ url: string; expiresAt: string }> {
    return Promise.resolve({ url: `https://signed.test/${assetId}`, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  }

  signThumbnails(assetIds: string[]) {
    return Promise.resolve(
      new Map(assetIds.map((id) => [id, { url: `https://thumb.test/${id}`, expiresAt: new Date(Date.now() + 60_000).toISOString() }]))
    );
  }
}
