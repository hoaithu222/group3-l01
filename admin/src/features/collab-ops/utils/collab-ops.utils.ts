import { COLLAB_KIND_LABELS, PRIVATE_DOCUMENT_LABEL } from '../constants/collab-ops.constants';
import type { LargeDocumentRow } from '../types/collab-ops.types';

/** "3 ngày 4 giờ" / "5 giờ 12 phút" / "42 phút" / "30 giây"; thiếu/không hợp lệ → `—`. */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  if (total < 60) return `${total} giây`;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600) % 24;
  const days = Math.floor(total / 86400);
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  if (hours > 0) return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  return `${minutes} phút`;
}

/** Tổng các giá trị của một bản đồ đếm theo loại (`connections`/`documents`). */
export const sumCounts = (counts: Record<string, number> | undefined): number =>
  Object.values(counts ?? {}).reduce((total, n) => total + (Number.isFinite(n) ? n : 0), 0);

/** Số đếm của MỘT loại (`document`/`whiteboard`); vắng loại đó = 0 (service không có kết nối/tài liệu loại ấy — vẫn là 0 thật). */
export const countOf = (counts: Record<string, number> | undefined, kind: string): number =>
  counts?.[kind] ?? 0;

/** `['document','whiteboard']` → "Tài liệu, Bảng trắng"; loại lạ (BE thêm loại mới) giữ nguyên mã. */
export const kindsLabel = (kinds: readonly string[] | undefined): string =>
  kinds && kinds.length > 0 ? kinds.map((k) => COLLAB_KIND_LABELS[k] ?? k).join(', ') : '—';

/**
 * Tiêu đề hiển thị của tài liệu lớn. Tài liệu PRIVATE KHÔNG BAO GIỜ hiện tiêu đề — kể cả khi BE lỡ trả kèm (`title` khác `null`):
 * lớp che ở client là lớp phòng thủ thứ hai sau lớp che ở BE (`CollabAdminService.largeDocuments`).
 */
export function largeDocumentTitle(row: Pick<LargeDocumentRow, 'title' | 'visibility'>): string {
  if (row.visibility === 'PRIVATE') return PRIVATE_DOCUMENT_LABEL;
  return row.title?.trim() ? row.title : '(Không có tiêu đề)';
}
