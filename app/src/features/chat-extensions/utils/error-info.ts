import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

import { CHAT_EXT_ERROR_MESSAGES, CHAT_EXT_VALIDATION_REASONS } from './chat-ext-errors.constants';

export interface ChatExtErrorInfo {
  code?: string;
  message: string;
  /** 404 / mã "không còn" (`POLL_005`, `MSG_012`, `PERM_404`): nội dung biến mất hoặc mất quyền — nơi gọi đóng tấm/thẻ thay vì cho thử lại. */
  gone: boolean;
  /** Lỗi thuộc ô THỜI GIAN (`SCHED_001`, `REMIND_001`, `POLL_002`) — gắn dưới ô giờ chứ không đưa lên toast. */
  timeField: boolean;
  /** `SCHED_003`/`RES_003`: bản ghi đã đổi ở nơi khác — nơi gọi tải lại danh sách. */
  stale: boolean;
  /** Đã hết lượt thử "bận" (503) — vẫn có thể bấm lại sau. */
  busy: boolean;
}

const GONE_CODES = new Set(['POLL_005', 'MSG_012', 'PERM_404']);
const TIME_FIELD_CODES = new Set(['SCHED_001', 'REMIND_001', 'POLL_002']);
const STALE_CODES = new Set(['SCHED_003', 'RES_003']);

/** `details.reason` của `VAL_001` (BE gắn lý do máy đọc được cho lỗi kiểm dữ liệu nghiệp vụ). */
function validationReason(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  if (typeof details !== 'object' || details === null) return undefined;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
}

/**
 * BE đòi XÁC NHẬN mở rộng người xem (`to-resource`: nguồn là hội thoại/kênh riêng tư mà tệp sẽ hiện cho MỌI thành viên nhóm đích) — 400 `VAL_001` kèm `details.requiresConfirmation === true`.
 * Đây KHÔNG phải lỗi cho người dùng đọc mà là câu hỏi: nơi gọi hiện bước xác nhận rồi gửi lại với `confirmVisibilityExpansion: true` (và khoá idempotency MỚI — BE lưu cả phản hồi 400 dưới khoá cũ).
 */
export function needsVisibilityConfirmation(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 400) return false;
  const details = (error.response.data as ApiErrorBody | undefined)?.error?.details;
  if (typeof details !== 'object' || details === null) return false;
  return (details as { requiresConfirmation?: unknown }).requiresConfirmation === true;
}

/**
 * Câu tiếng Việt + phân loại cho MỌI lỗi của `chat-extensions`. Mã ngoài bảng rơi về `toErrorMessage` (mất mạng, hết giờ, 5xx…).
 * ⛔ Không đọc `error.response` trên lỗi không phải axios (một `TypeError` ném lỗi MỚI giữa lúc đang hiện lỗi cũ) — cùng luật `announcements/utils/error-info.ts`.
 */
export function describeChatExtError(error: unknown): ChatExtErrorInfo {
  if (!isAxiosError(error)) {
    return { busy: false, gone: false, message: toErrorMessage(error), stale: false, timeField: false };
  }
  const status = error.response?.status;
  const code = getErrorCode(error);
  const reason = code === 'VAL_001' ? validationReason(error) : undefined;
  const message =
    (reason && CHAT_EXT_VALIDATION_REASONS[reason]) || CHAT_EXT_ERROR_MESSAGES[code] || toErrorMessage(error);
  return {
    busy: status === 503,
    code,
    gone: status === 404 || GONE_CODES.has(code),
    message,
    stale: STALE_CODES.has(code),
    timeField: TIME_FIELD_CODES.has(code),
  };
}
