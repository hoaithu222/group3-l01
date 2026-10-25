import type { AuditService } from "../../audit-log/audit-log.service";
import type { TxHandle } from "../repositories/tx";

/** `AuditService.record()` — không bao giờ ném lỗi ra nghiệp vụ chính. Chỉ ghi id/giá trị enum; KHÔNG ghi tên/nội dung (bảng PRIVATE không lộ ra admin). */
export type AuditRecorder = Pick<AuditService, "record">;

/** Tối thiểu về asset cần để kiểm trước khi đặt làm ảnh thu nhỏ. */
export interface AttachableAsset {
  scope: string;
  kind: string;
  status: string;
  ownerId: string;
}

/** Cổng ảnh thu nhỏ (`AssetLink{WHITEBOARD}`) — bọc `AssetLifecycleService`/`AssetLinkService` của module `assets`. */
export interface IWhiteboardAssetPort {
  find(assetId: string): Promise<AttachableAsset | null>;
  /** Gỡ MỌI link cũ của bảng rồi gắn `assetId` (asset cũ mất hết link → `assets.cleanup` dọn sau ân hạn), trong transaction của caller. */
  replaceThumbnail(tx: TxHandle, input: { assetId: string; whiteboardId: string; workspaceId: string; actorId: string }): Promise<void>;
  /** Ký URL ảnh thu nhỏ cho NHIỀU asset trong 1 lượt — caller đã kiểm quyền đọc bảng. Asset chưa sẵn sàng bị bỏ khỏi Map. */
  signThumbnails(assetIds: string[]): Promise<Map<string, string>>;
}
