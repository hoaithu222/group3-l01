import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { createAssetLifecycleService, createAssetLinkService } from "../../assets/public";
import type { TxHandle } from "../repositories/tx";

/**
 * Cổng ảnh huy hiệu (p4-03 be.md §12): kiểm asset dùng làm `Badge.iconAssetId` và gắn/gỡ `AssetLink BADGE_ICON` — service KHÔNG import
 * `assets` trực tiếp mà nhận cổng này (adapter thật ở dưới chỉ đi qua `@modules/assets/public`).
 */
export interface IGamBadgeIcons {
  /**
   * Asset dùng được làm ảnh huy hiệu: tồn tại, `READY`, scope `BADGE`, kind `IMAGE` (bản gốc), CHỦ là người đang lưu (người này đã qua
   * `requirePermission("gamification:update")` nên chủ = admin), và chưa gắn vào đâu. Sai → `AppError` (chưa ghi gì).
   */
  assertUsable(assetId: string, actorId: string): Promise<void>;
  /** Gắn `AssetLink BADGE_ICON` (scope `NONE` — quyền đọc do resolver của `gamification`) trong transaction của caller. */
  attach(tx: TxHandle, input: { badgeId: string; assetId: string; actorId: string }): Promise<void>;
  /** Gỡ link ảnh cũ (asset còn mồ côi được `assets.cleanup` dọn sau thời gian ân hạn). Không có link → không làm gì. */
  detach(tx: TxHandle, input: { badgeId: string; assetId: string }): Promise<void>;
}

export class PublicAssetsGamBadgeIcons implements IGamBadgeIcons {
  private readonly lifecycle = createAssetLifecycleService();
  private readonly links = createAssetLinkService();

  async assertUsable(assetId: string, actorId: string): Promise<void> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) throw new NotFoundError("Không tìm thấy ảnh huy hiệu");
    const { asset, linked } = found;
    if (asset.status !== "READY") throw new AppError(ErrorMessages[ErrorCode.ASSET_003], 409, ErrorCode.ASSET_003);
    if (asset.scope !== "BADGE" || asset.kind !== "IMAGE" || asset.parentAssetId !== null) {
      throw new AppError("Loại tệp không hợp lệ cho ảnh huy hiệu", 415, ErrorCode.ASSET_001);
    }
    if (asset.ownerId !== actorId) throw new AppError(ErrorMessages[ErrorCode.ASSET_005], 403, ErrorCode.ASSET_005);
    if (linked) throw new AppError("Ảnh này đã được dùng ở nơi khác", 409, ErrorCode.ASSET_004);
  }

  async attach(tx: TxHandle, input: { badgeId: string; assetId: string; actorId: string }): Promise<void> {
    await this.links.attach(tx, { assetIds: [input.assetId], targetType: "BADGE_ICON", targetId: input.badgeId, scopeType: "NONE", actorId: input.actorId });
  }

  async detach(tx: TxHandle, input: { badgeId: string; assetId: string }): Promise<void> {
    await this.links.detach(tx, { targetType: "BADGE_ICON", targetId: input.badgeId, assetIds: [input.assetId] });
  }
}
