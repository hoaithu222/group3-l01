/** Một tệp đính kèm (thẻ hoặc bình luận) — chỉ trường cần hiển thị, không lộ `storageKey`. */
export interface TaskAttachmentRow {
  assetId: string;
  originalName: string;
  mime: string;
  /** Kích thước thật (sau `complete`); `null` khi chưa xác nhận. */
  size: number | null;
  kind: string;
  hasThumbnail: boolean;
  attachedBy: string;
  createdAt: Date;
}

/**
 * Đọc `AssetLink`/`Asset` (chỉ-đọc, xuyên collection) cho danh sách đính kèm. GHI đi qua `@modules/assets/public`
 * (`AssetLinkService.attach/detach`) — module `assets` chưa có API "liệt kê theo đối tượng" nên phần đọc nằm ở đây.
 */
export interface ITaskAttachmentRepository {
  /** Tệp gắn vào thẻ (`AssetLink.targetType = TASK`), cũ → mới; bỏ tệp đã xoá/chưa READY. */
  listForTask(taskId: string): Promise<TaskAttachmentRow[]>;
  /** Tệp của nhiều bình luận (`TASK_COMMENT`) trong MỘT lượt (không N+1): `commentId → tệp`. */
  listForComments(commentIds: string[]): Promise<Map<string, TaskAttachmentRow[]>>;
  /** Link TASK của một tệp với thẻ — `createdBy` quyết định ai được gỡ. */
  findTaskLink(taskId: string, assetId: string): Promise<{ assetId: string; createdBy: string } | null>;
}
