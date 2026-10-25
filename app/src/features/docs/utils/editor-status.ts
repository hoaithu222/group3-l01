import type { StatusPayload } from '../webview/doc-editor-bridge.types';

export type StatusTone = 'error' | 'neutral' | 'success' | 'warning';

/**
 * Chấm trạng thái ở thanh tiêu đề editor (app.md §3): "Đã lưu" · "Đang đồng bộ…" · "Mất kết nối" · "Chưa lưu được — sẽ thử lại".
 * Luôn kèm CHỮ (không chỉ màu — trợ năng). Nguồn là `status` của bridge:
 *  · `connecting` chưa đồng bộ lần nào → "Đang kết nối…";
 *  · `offline` (từng đồng bộ, đang nối lại) → "Mất kết nối" — thay đổi giữ trong Y.Doc, tự hợp nhất khi nối lại;
 *  · `closed` (mất quyền/không tồn tại) → "Đã ngắt kết nối";
 *  · `synced`: `saveFailed` (BE tạm lỗi — các máy vẫn đồng bộ với nhau, collab thử lại) → "Chưa lưu được — sẽ thử lại"; còn
 *    thay đổi chưa được server xác nhận → "Đang đồng bộ…"; còn lại "Đã lưu". Chế độ chỉ đọc không có gì để lưu → "Chỉ xem".
 */
export function statusLabel(status: StatusPayload | null): { text: string; tone: StatusTone } {
  if (!status) return { text: 'Đang kết nối…', tone: 'neutral' };
  if (status.connection === 'closed') return { text: 'Đã ngắt kết nối', tone: 'error' };
  if (status.connection === 'offline') return { text: 'Mất kết nối', tone: 'warning' };
  if (status.connection === 'connecting') return { text: 'Đang kết nối…', tone: 'neutral' };
  if (status.readOnly) return { text: 'Chỉ xem', tone: 'neutral' };
  if (status.saveFailed) return { text: 'Chưa lưu được — sẽ thử lại', tone: 'warning' };
  if (status.unsynced) return { text: 'Đang đồng bộ…', tone: 'neutral' };
  return { text: 'Đã lưu', tone: 'success' };
}

export type BannerTone = 'error' | 'info' | 'warning';

/**
 * MỘT banner ưu tiên cao nhất dưới thanh trạng thái (không chồng nhiều khối cảnh báo): quá lớn > đã lưu trữ > chỉ xem > ngoại tuyến >
 * gần đầy > phiên đang không làm mới được. `null` = không cần banner.
 */
export function statusBanner(
  status: StatusPayload | null,
  tokenProblem: boolean,
): { text: string; tone: BannerTone } | null {
  if (status?.tooLarge) {
    return {
      text: 'Tài liệu quá lớn nên không thể thêm nội dung nữa. Hãy xoá bớt hoặc tách thành tài liệu khác.',
      tone: 'error',
    };
  }
  if (status?.archived) return { text: 'Tài liệu đã lưu trữ — chỉ xem được.', tone: 'info' };
  if (status?.readOnly)
    return { text: 'Chỉ xem — bạn không có quyền sửa tài liệu này.', tone: 'info' };
  if (status?.connection === 'offline') {
    return { text: 'Đang ngoại tuyến — thay đổi sẽ đồng bộ khi có mạng.', tone: 'warning' };
  }
  if (status?.nearLimit) return { text: 'Tài liệu sắp đạt dung lượng tối đa.', tone: 'warning' };
  if (tokenProblem) {
    return { text: 'Chưa làm mới được phiên soạn thảo. Ứng dụng đang thử lại.', tone: 'warning' };
  }
  return null;
}

/** Editor đang nhận sửa chưa? — cả `status` (không chỉ đọc) lẫn `selectionState.canEdit` (đã đồng bộ lần đầu) — quyết việc hiện toolbar/nút "Sửa". */
export function isEditable(status: StatusPayload | null, canEdit: boolean | undefined): boolean {
  return Boolean(status && !status.readOnly && status.connection !== 'closed' && canEdit);
}
