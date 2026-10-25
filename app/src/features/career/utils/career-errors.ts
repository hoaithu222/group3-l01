import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Câu tiếng Việt cho mã lỗi `SKILL_*` (be.md p6-06 §8) — nhãn lỗi nằm trong FEATURE (không sửa bảng lỗi lõi). Người dùng thường chỉ gặp
 * 404 (kỹ năng không còn / không chia sẻ); các mã còn lại là của vận hành nhưng vẫn khai để không rơi về câu chung vô nghĩa.
 */
export const CAREER_ERROR_MESSAGES: Record<string, string> = {
  SKILL_001: 'Mã kỹ năng đã tồn tại',
  SKILL_002: 'Tiêu chí kỹ năng không hợp lệ',
  SKILL_003: 'Bạn chưa có huy hiệu kỹ năng này',
  SKILL_004: 'Huy hiệu chưa bị thu hồi',
  SKILL_005: 'Đã đạt số kỹ năng tối đa',
  SKILL_006: 'Vừa chạy đánh giá lại gần đây, thử lại sau',
};

export function careerErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  const code = (error.response?.data as ApiErrorBody | undefined)?.error?.code;
  return (code ? CAREER_ERROR_MESSAGES[code] : undefined) ?? fallback;
}

/** 404/403 — kỹ năng không còn, người đó không chia sẻ huy hiệu, hoặc cờ `career` tắt (không lộ lý do cụ thể). */
export function isNotShared(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 404 || status === 403;
}
