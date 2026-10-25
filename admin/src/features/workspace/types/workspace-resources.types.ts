/**
 * Kiểu dữ liệu tab `resources` (Tài liệu) — khớp hợp đồng admin của module `resources`
 * phía BE (p3-01 admin.md §3): `GET /admin/workspaces/:id/resource-stats`,
 * `PUT /admin/workspaces/:id/resource-quota`, `POST .../resource-quota/reset`.
 *
 * ⛔ CHỈ SỐ LIỆU dung lượng. CỐ Ý không có (và không được thêm) trường nào nêu tên tệp,
 * tên thư mục hay nội dung kho tài liệu — đó là dữ liệu của nhóm, không phải của quản trị nền
 * tảng. `tests/features/workspace/resources-privacy.test.tsx` quét file này để chặn.
 *
 * Viết tay theo `admin.md` vì `openapi.json` chưa được sinh (p0-09).
 */

/** `DEFAULT` = hạn mức toàn cục; `OVERRIDE` = quản trị nền tảng đặt riêng cho nhóm này. */
export type ResourceQuotaSource = 'DEFAULT' | 'OVERRIDE';

/** Một hàng "theo loại" — chỉ đếm và cộng dung lượng, không có danh sách tệp. */
export interface ResourceTypeStat {
  /** `ResourceType` phía BE (PDF, IMAGE, VIDEO, AUDIO, CODE, DOC, SHEET, SLIDE, TEXT, OTHER). */
  type: string;
  count: number;
  bytes: number;
}

export interface ResourceStatsView {
  usedBytes: number;
  quotaBytes: number;
  quotaSource: ResourceQuotaSource;
  fileCount: number;
  folderCount: number;
  /** Dung lượng tệp đang ở thùng rác (vẫn tính vào `usedBytes` tới khi dọn vĩnh viễn). */
  trashBytes: number;
  byType: ResourceTypeStat[];
}

export interface SetResourceQuotaPayload {
  bytes: number;
  reason: string;
}

export interface ResetResourceQuotaPayload {
  reason: string;
}

/** Kết quả đặt/xoá hạn mức — hạn mức HIỆU LỰC sau thao tác (xoá riêng → về mặc định, `quotaSource: DEFAULT`). */
export interface ResourceQuotaResult {
  quotaBytes: number;
  quotaSource: ResourceQuotaSource;
}
