import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Câu lỗi khi GỬI báo cáo (`POST /reports`) — lỗi thuộc về FORM nên hiện TRONG tấm, không toast.
 *
 * Ghi đè bảng chung ở những mã mà ngữ cảnh "đang gửi báo cáo" cần câu cụ thể hơn câu chung:
 *   · `MOD_003` — tin hệ thống, hoặc đích là hội thoại 1-1 (BE: "báo cáo NGƯỜI DÙNG thay thế");
 *   · `MOD_006` — 429, kèm `details.retryAfterSeconds` thì nói rõ bao lâu (README p1-08 §3 "429 đếm ngược");
 *   · `BLOCK_001` — tự báo cáo mình (kể cả tin của chính mình).
 * Mọi mã khác đi theo `toErrorMessage` (đã có bảng `MOD_*`/`BLOCK_*`).
 */
export function reportSubmitErrorMessage(error: unknown): string {
  if (!isAxiosError(error) || !error.response) return toErrorMessage(error);
  const code = getErrorCode(error);

  if (code === 'MOD_003') {
    return 'Không thể báo cáo mục này. Với tin hệ thống hoặc cuộc trò chuyện 1-1, hãy báo cáo người dùng.';
  }
  if (code === 'BLOCK_001') return 'Bạn không thể báo cáo chính mình.';
  if (code === 'MOD_006') {
    const body = error.response.data as ApiErrorBody | undefined;
    const seconds = (body?.error?.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (typeof seconds === 'number' && seconds > 0) {
      const minutes = Math.ceil(seconds / 60);
      return `Bạn đã gửi quá nhiều báo cáo. Thử lại sau khoảng ${String(minutes)} phút.`;
    }
  }
  return toErrorMessage(error);
}

/**
 * Câu lỗi khi XỬ LÝ báo cáo (`POST /reports/:id/resolve`).
 *   · `MOD_001` (409) — người khác đã đóng nhóm này: nói rõ + nơi gọi làm mới hàng đợi.
 *   · `MOD_003` — hành động không áp dụng (vd gỡ tin cho báo cáo không phải tin).
 *   · `PERM_006` (403) — không còn là người kiểm duyệt của phạm vi này.
 *   · 404 — báo cáo/phạm vi không còn thấy (trung tính, không phân biệt "không tồn tại"/"không quyền").
 */
export function resolveErrorMessage(error: unknown): string {
  if (!isAxiosError(error) || !error.response) return toErrorMessage(error);
  const code = getErrorCode(error);
  if (code === 'MOD_001') return 'Báo cáo đã được xử lý bởi người khác. Danh sách sẽ được làm mới.';
  if (error.response.status === 404) return 'Báo cáo không còn khả dụng.';
  return toErrorMessage(error);
}

/** `MOD_001` — nơi gọi cần biết để làm mới hàng đợi (khác các lỗi còn lại: nhóm ĐÃ đóng, không phải thất bại). */
export function isAlreadyResolved(error: unknown): boolean {
  return isAxiosError(error) && getErrorCode(error) === 'MOD_001';
}

/** Lỗi của `POST /me/blocks`. `BLOCK_004` (409) cần câu đọc kỹ nên hiện trong hộp xác nhận. */
export function blockErrorMessage(error: unknown): string {
  if (!isAxiosError(error) || !error.response) return toErrorMessage(error);
  if (error.response.status === 404) return 'Không tìm thấy người dùng này.';
  return toErrorMessage(error);
}

/** 403/404 ở hàng đợi = KHÔNG có (hoặc không thấy) phạm vi kiểm duyệt — khác lỗi mạng/máy chủ. */
export function isQueueForbidden(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return false;
  return error.response.status === 403 || error.response.status === 404;
}
