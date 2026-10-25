import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

/**
 * Đọc lỗi của biên bản/bản ghi (BE `MEET_*`, `REC_*`, `RES_003`, `ASSET_*`). Mỗi mã có CHỖ hiện riêng trên màn (app.md §3) — hàm ở đây chỉ
 * phân loại, câu chữ lấy từ BE (đã tiếng Việt) trừ vài mã cần nói rõ hơn cho người dùng cuối.
 */

interface ErrorBody {
  error?: { code?: string; details?: { current?: number } | Record<string, unknown> };
}

export function errorCodeOf(error: unknown): string | null {
  if (!isAxiosError(error) || !error.response) return null;
  return (error.response.data as ErrorBody | undefined)?.error?.code ?? null;
}

/** Mất mạng/không tới được máy chủ — khác lỗi nghiệp vụ (nút lưu tắt "Kết nối lại để lưu", không đổ lỗi cho người dùng). */
export function isOfflineError(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}

/** 404 (cuộc họp/biên bản/bản ghi không còn, hoặc không còn quyền — BE không phân biệt để khỏi lộ tồn tại). */
export function isGoneError(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return false;
  const code = errorCodeOf(error);
  return error.response.status === 404 || code === 'MEET_001' || code === 'REC_005' || code === 'CFG_005';
}

export const isVersionConflict = (error: unknown): boolean => errorCodeOf(error) === 'RES_003';

const RECAP_COPY: Record<string, string> = {
  MEET_002: 'Bạn không có quyền sửa biên bản này.',
  MEET_021: 'Chỉ viết biên bản cho cuộc họp đang diễn ra hoặc đã kết thúc.',
  MEET_022: 'Biên bản đã đạt số tệp đính kèm tối đa.',
  MEET_023: 'Biên bản cần có nội dung (hoặc ít nhất một tệp) và không vượt quá độ dài cho phép.',
  REC_004: 'Bản ghi chưa sẵn sàng.',
  REC_005: 'Bản ghi đã bị xoá hoặc hết hạn lưu trữ.',
};

/** Câu hiện cho người dùng — ưu tiên câu riêng của màn, còn lại theo `toErrorMessage` (câu BE/mạng). */
export function recapErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  return (code && RECAP_COPY[code]) ?? toErrorMessage(error);
}
