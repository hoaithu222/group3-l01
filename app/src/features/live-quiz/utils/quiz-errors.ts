import { isAxiosError } from 'axios';

import { getErrorCode } from '@/core/api/client.helpers';

/**
 * Nhãn `QUIZ_*` riêng của feature — ⚠️ bảng chung `shared/constants/error-codes.ts` đã chạm trần, nên nhãn nằm ở đây.
 * Khớp `be/src/modules/live-quiz/live-quiz.errors.ts`.
 */
export const QUIZ_ERROR_MESSAGES: Record<string, string> = {
  ACK_TIMEOUT: 'Chưa gửi được — kiểm tra kết nối',
  PERM_001: 'Phiên chỉ dành cho thành viên nhóm',
  QUIZ_001: 'Mã PIN không đúng hoặc đã hết hạn',
  QUIZ_002: 'Phiên thi đã kết thúc',
  QUIZ_003: 'Phòng đã đủ người',
  QUIZ_004: 'Bạn đã trả lời câu này',
  QUIZ_005: 'Hết giờ',
  QUIZ_006: 'Bộ học chưa đủ câu trắc nghiệm một đáp án để tổ chức thi',
  QUIZ_007: 'Phiên không ở trạng thái phù hợp — đang tải lại',
  QUIZ_008: 'Kết quả đang được tổng hợp',
  QUIZ_009: 'Hệ thống đang bận, thử lại sau ít phút',
  QUIZ_010: 'Bạn đã bị mời ra khỏi phòng này',
  RES_003: 'Phiên vừa thay đổi — đang tải lại',
};

/** Mã lỗi từ lỗi HTTP (axios) hoặc chuỗi mã ack socket. */
export function quizErrorCode(error: unknown): string {
  if (typeof error === 'string') return error;
  return isAxiosError(error) ? getErrorCode(error) : '';
}

export function quizErrorMessage(error: unknown, fallback = 'Có lỗi xảy ra, thử lại sau'): string {
  return QUIZ_ERROR_MESSAGES[quizErrorCode(error)] ?? fallback;
}
