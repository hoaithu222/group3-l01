import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Đọc `error.details` của một lỗi backend (be.md §4: `CH_001` kèm
 * `details.archivedChannelId?`). Trả `undefined` khi không phải lỗi có cấu
 * trúc — nơi gọi (`NameStep`) chỉ cần biết CÓ hay KHÔNG, không cần phân biệt lý
 * do (mất mạng, lỗi khác).
 */
export function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}

/** `CH_001` trùng tên — id kênh cũ đã lưu trữ cùng tên, nếu có (app.md §3). */
export function getArchivedChannelId(error: unknown): string | undefined {
  const details = getErrorDetails(error);
  const id = details?.archivedChannelId;
  return typeof id === 'string' ? id : undefined;
}
