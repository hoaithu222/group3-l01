import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import { MENTOR_ERROR_MESSAGES } from '../constants/mentor.constants';

interface ErrorBody {
  error?: { code?: string; details?: Record<string, unknown> };
}

function bodyOf(error: unknown): ErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ErrorBody | undefined) : undefined;
}

/** Mã lỗi BE (`MENTOR_005`…) — chỗ UI RẼ NHÁNH theo mã. */
export function mentorErrorCode(error: unknown): string | null {
  return bodyOf(error)?.error?.code ?? null;
}

export function httpStatusOf(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/** Câu tiếng Việt: ưu tiên nhãn `MENTOR_*` của feature, còn lại dùng bộ dịch chung. */
export function mentorErrorMessage(error: unknown): string {
  const code = mentorErrorCode(error);
  return (code && MENTOR_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/** 404 (bài ẩn/không còn, cờ `mentor` tắt → `CFG_005`) — màn hiện "Bài không còn khả dụng". */
export function isNotAvailable(error: unknown): boolean {
  return httpStatusOf(error) === 404 || mentorErrorCode(error) === 'CFG_005';
}

/** `MENTOR_008` kèm `details.channelIds` — đánh dấu kênh không hợp lệ trong tấm chấp nhận. */
export function invalidChannelIdsOf(error: unknown): string[] {
  if (mentorErrorCode(error) !== 'MENTOR_008') return [];
  const ids = bodyOf(error)?.error?.details?.channelIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}
