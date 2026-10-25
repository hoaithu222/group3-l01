import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import { MEDIA_UNAVAILABLE_MESSAGE } from './call-messages';

/**
 * Phân loại lỗi `POST /calls` · `answer` · `join` (BE `CALL_*`, `be/src/core/utils/error.codes.ts`). Mỗi loại một hướng
 * xử lý khác nhau (hộp thoại / toast / im lặng) nên KHÔNG dùng toast chung: người dùng đang nhìn màn gọi.
 */
export type CallFailureKind =
  | 'ALREADY_ENDED'
  | 'ANSWERED_ELSEWHERE'
  | 'ARCHIVED'
  | 'FEATURE_OFF'
  | 'FULL'
  | 'IN_OTHER_CALL'
  | 'INVALID_TARGET'
  | 'MEETING_LIVE'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'NO_ACCESS'
  | 'OFFLINE'
  | 'OTHER'
  | 'RATE_LIMITED'
  | 'READ_ONLY'
  | 'REMOVED'
  | 'SCREEN_BUSY'
  | 'STATE_CHANGED';

export interface CallFailure {
  /** `details.activeCallId` của `CALL_004` — cho nút "Quay lại cuộc gọi". */
  activeCallId?: string;
  kind: CallFailureKind;
  /** `details.activeCall.scopeTitle` của `CALL_004` — "Bạn đang trong cuộc gọi với …" (phòng thoại kênh, p2-03). */
  activeCallTitle?: string;
  /** `details.meetingId` của `CALL_007` — cho nút "Vào phòng họp". */
  meetingId?: string;
  message: string;
  /** `details.sameCallOtherDevice` của `CALL_004`: đã ở CHÍNH phòng này trên thiết bị khác (phòng thoại kênh, p2-03). */
  sameCallOtherDevice?: boolean;
}

const BY_CODE: Record<string, CallFailureKind> = {
  CALL_001: 'NO_ACCESS',
  CALL_002: 'READ_ONLY',
  CALL_004: 'IN_OTHER_CALL',
  CALL_005: 'ALREADY_ENDED',
  CALL_006: 'STATE_CHANGED',
  CALL_007: 'MEETING_LIVE',
  CALL_008: 'FULL',
  CALL_009: 'RATE_LIMITED',
  CALL_011: 'STATE_CHANGED',
  CALL_012: 'FEATURE_OFF',
  // Phòng thoại kênh (p2-03) — khai ở ĐÂY (không phải `shared/constants/error-codes.ts`: bảng đó đã chạm trần dòng).
  CALL_014: 'NOT_IN_ROOM',
  CALL_015: 'NOT_HOST',
  CALL_016: 'REMOVED',
  CALL_017: 'SCREEN_BUSY',
  CALL_018: 'ARCHIVED',
  CALL_019: 'INVALID_TARGET',
};

export const CALL_FAILURE_TEXT: Record<CallFailureKind, string> = {
  ALREADY_ENDED: 'Cuộc gọi đã kết thúc.',
  ANSWERED_ELSEWHERE: 'Cuộc gọi đã được trả lời ở thiết bị khác.',
  ARCHIVED: 'Kênh hoặc nhóm đã được lưu trữ nên không thể vào phòng.',
  FEATURE_OFF: 'Tính năng gọi chưa được bật hoặc chưa cấu hình.',
  FULL: 'Cuộc gọi đã đủ số người tham gia.',
  IN_OTHER_CALL: 'Bạn đang ở trong một cuộc gọi khác.',
  INVALID_TARGET: 'Người này không còn ở trong phòng nên không thể chọn.',
  MEETING_LIVE: 'Nhóm đang họp — hãy vào phòng họp.',
  NOT_HOST: 'Chỉ chủ phòng mới làm được việc này.',
  NOT_IN_ROOM: 'Bạn hoặc người này không còn ở trong phòng.',
  NO_ACCESS: 'Bạn không có quyền gọi trong cuộc trò chuyện này.',
  OFFLINE: 'Cần kết nối mạng để gọi.',
  OTHER: 'Không thực hiện được cuộc gọi. Vui lòng thử lại.',
  RATE_LIMITED: 'Bạn gọi quá nhanh, vui lòng thử lại sau ít phút.',
  READ_ONLY: 'Cuộc trò chuyện đang chỉ đọc hoặc đã chặn nhau nên không thể gọi.',
  REMOVED: 'Bạn đã được mời ra khỏi phòng này, không vào lại được phiên hiện tại.',
  SCREEN_BUSY: 'Đang có người chia sẻ màn hình trong phòng.',
  STATE_CHANGED: 'Trạng thái cuộc gọi vừa thay đổi. Vui lòng thử lại.',
};

export function classifyCallError(error: unknown): CallFailure {
  if (error instanceof Error && error.name === 'MediaUnavailableError') {
    return { kind: 'OTHER', message: MEDIA_UNAVAILABLE_MESSAGE };
  }
  if (!isAxiosError(error)) return { kind: 'OTHER', message: toErrorMessage(error) };
  if (!error.response) return { kind: 'OFFLINE', message: CALL_FAILURE_TEXT.OFFLINE };

  const body = error.response.data as
    | { error?: { code?: string; details?: Record<string, unknown> } }
    | undefined;
  const code = body?.error?.code ?? '';
  const details = body?.error?.details;
  // `CALL_006` kèm `details.answeredElsewhere` phân biệt "máy khác đã nhận" với "người gọi đã huỷ" (CL-02).
  const kind: CallFailureKind =
    code === 'CALL_006' && details?.answeredElsewhere === true ? 'ANSWERED_ELSEWHERE' : (BY_CODE[code] ?? 'OTHER');
  const meetingId = typeof details?.meetingId === 'string' ? details.meetingId : undefined;
  const activeCallId = typeof details?.activeCallId === 'string' ? details.activeCallId : undefined;
  const active = details?.activeCall as { scopeTitle?: unknown } | undefined;
  const activeCallTitle = typeof active?.scopeTitle === 'string' ? active.scopeTitle : undefined;
  const sameCallOtherDevice = details?.sameCallOtherDevice === true ? true : undefined;
  return { activeCallId, activeCallTitle, kind, meetingId, message: CALL_FAILURE_TEXT[kind], sameCallOtherDevice };
}
