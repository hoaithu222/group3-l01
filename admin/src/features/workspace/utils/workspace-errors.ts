import { isAxiosError } from 'axios';

/** Trạng thái HTTP của một lỗi tải; `undefined` khi không phải phản hồi HTTP (mất mạng, timeout, bị huỷ). */
export function httpStatusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * 403 (thiếu quyền) / 404 (workspace hay bản ghi không còn): bấm "Thử lại" vô ích — báo thẳng lý do, KHÔNG
 * đưa nút. Mọi lỗi khác (mất mạng, timeout, 5xx) là TẠM THỜI và PHẢI có nút thử lại: người dùng không có
 * cách nào khác để lấy lại dữ liệu ngoài việc tải lại cả trang.
 */
export function isUnavailableError(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 403 || status === 404;
}
