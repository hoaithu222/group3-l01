import type { AuditService } from "../../audit-log/audit-log.service";
import type { DocumentEntity } from "../entities/document.interface";
import type { TxHandle } from "../repositories/tx";

/** `AuditService.record()` — không bao giờ ném lỗi ra nghiệp vụ chính. Chỉ ghi id/giá trị enum; KHÔNG ghi tiêu đề/nội dung (tài liệu PRIVATE không lộ ra admin). */
export type AuditRecorder = Pick<AuditService, "record">;

/** Thông báo `document.collaborator-added` ghi TRONG transaction thêm người cộng tác (Prisma: `notify(tx, …)`; test: ghi lại lời gọi). */
export interface IDocumentNotifier {
  collaboratorsAdded(tx: TxHandle, input: { doc: DocumentEntity; actorId: string; userIds: string[]; role: "EDITOR" | "VIEWER" }): Promise<void>;
}

/** Tối thiểu về asset cần để kiểm trước khi gắn ảnh vào tài liệu. */
export interface AttachableAsset {
  scope: string;
  kind: string;
  status: string;
  ownerId: string;
}

/** Cổng gắn ảnh chèn (`AssetLink{DOCUMENT}`) — bọc `AssetLifecycleService`/`AssetLinkService` của module `assets`. */
export interface IDocumentAssetPort {
  find(assetId: string): Promise<AttachableAsset | null>;
  attach(tx: TxHandle, input: { assetId: string; documentId: string; workspaceId: string; actorId: string }): Promise<void>;
}
