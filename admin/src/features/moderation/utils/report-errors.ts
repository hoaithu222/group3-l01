import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';

/** Mã lỗi BE (`be/src/core/utils/error.codes.ts`) mà giao diện phân biệt. */
export const MOD_ALREADY_HANDLED = 'MOD_001';
export const MOD_NOT_ALLOWED = 'MOD_004';
export const MOD_ACCESS_EXPIRED = 'MOD_005';

export const errorCodeOf = (err: unknown): string => extractErrorCode(err as AxiosError);

/**
 * 400 (id sai dạng) / 403 / 404: báo cáo không tồn tại hoặc người xem không được phép — bấm "Thử lại"
 * vô ích. Lỗi khác (mất mạng, 5xx) là tạm thời và PHẢI có nút thử lại.
 */
export const isReportUnavailable = (err: unknown): boolean => {
  const status = (err as AxiosError | null | undefined)?.response?.status;
  return status === 400 || status === 403 || status === 404;
};

/** `409 MOD_001` — người khác đã xử lý nhóm này trong lúc bạn đang mở. */
export const isAlreadyHandled = (err: unknown): boolean => errorCodeOf(err) === MOD_ALREADY_HANDLED;

/**
 * Chạy một hành động và NUỐT lỗi `MOD_001`: interceptor đã toast "Báo cáo này đã được xử lý", hook
 * đã làm mới dữ liệu, và hành động không bao giờ thành công được nữa — giữ `ConfirmWithReasonModal`
 * mở là vô nghĩa. Lỗi khác vẫn ném tiếp ⇒ modal giữ mở để thử lại (cùng cách `tolerateStaleJob`).
 */
export async function tolerateAlreadyHandled(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (!isAlreadyHandled(err)) throw err;
  }
}
