/**
 * Giới hạn Resource Hub — bản SAO mặc định của `LIMITS.resource` (README p3-01
 * §7). Nguồn thật là backend (`capabilities.limits.resource`, nếu BE có trả);
 * đổi số bên BE thì đổi Ở ĐÂY theo — đây là bản sao chứ không phải nguồn.
 */
export interface ResourceLimits {
  folderDepthMax: number;
  folderNameMax: number;
  resourceNameMax: number;
  /** Byte — vượt thì `CodePreview` không tải, hiện "Tệp quá lớn". */
  codePreviewMaxBytes: number;
  /** Số dòng tối đa `CodePreview` vẽ (README §2 "Xem mã"). */
  codePreviewMaxLines: number;
  /** Byte — hạn mức mặc định, dùng khi endpoint storage không tới được. */
  workspaceQuotaBytes: number;
  trashRetentionDays: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  folderDepthMax: 8,
  folderNameMax: 120,
  resourceNameMax: 200,
  codePreviewMaxBytes: 512 * 1024,
  codePreviewMaxLines: 2000,
  workspaceQuotaBytes: 2 * 1024 * 1024 * 1024,
  trashRetentionDays: 30,
};

/** Ngưỡng hiện `StorageUsageBanner` (README/lead: ≥ 90 % hạn mức). */
export const STORAGE_WARN_RATIO = 0.9;

/** Trang danh sách tệp (app.md §4 "cursor 30"). */
export const RESOURCE_PAGE_SIZE = 30;

/** Tệp lớn hơn ngưỡng này + đang dùng dữ liệu di động → hỏi trước khi tải (app.md §7). */
export const EXPENSIVE_DOWNLOAD_BYTES = 5 * 1024 * 1024;
