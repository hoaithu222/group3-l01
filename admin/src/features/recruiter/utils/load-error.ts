import type { AxiosError } from 'axios';

/**
 * 400 (id sai dạng) / 403 / 404: bản ghi không tồn tại hoặc người xem không được phép — "Thử lại" vô ích, phải nói rõ lý do (api-patterns.md "Trạng thái LỖI TẢI").
 * Lỗi khác (mất mạng, 5xx) là TẠM THỜI và PHẢI có nút thử lại.
 */
export const isUnavailableError = (err: unknown): boolean => {
  const status = (err as AxiosError | null | undefined)?.response?.status;
  return status === 400 || status === 403 || status === 404;
};
