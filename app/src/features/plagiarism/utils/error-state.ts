import { httpStatusOf, isNetworkError } from '@/shared/utils/errors';

/**
 * Chọn trạng thái lỗi cho `ScreenState` theo luật chung (xem JSDoc `ScreenState`):
 *  · không tới được máy chủ → `offline` (câu nói rõ là lỗi KẾT NỐI, "Thử lại" chữa được);
 *  · 403/404 (không phải trưởng nhóm, lượt quét đã xoá) → `forbidden` — ⛔ không nút "Thử lại": thử lại vẫn 403/404;
 *  · còn lại → `error` + "Thử lại".
 * Trước đây mọi lỗi đều hiện "Không xem được" (mất quyền) — kể cả khi chỉ là mất sóng.
 */
export function errorStateOf(error: unknown): 'error' | 'forbidden' | 'offline' {
  if (isNetworkError(error)) return 'offline';
  const status = httpStatusOf(error);
  if (status === 403 || status === 404) return 'forbidden';
  return 'error';
}
