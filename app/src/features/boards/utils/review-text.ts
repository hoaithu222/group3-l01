import { toErrorMessage } from '@/core/api/client.helpers';

import type { ReviewRoundStatus } from '../api/reviews.types';
import { getErrorCode } from './error-details';
import type { ScoreProblem } from './review-score';

/**
 * Câu tiếng Việt của chấm chéo (p4-05 app.md §2 `utils/review-text.ts`). Hàm THUẦN.
 *
 * Nhãn lỗi `REVIEW_001..007` đặt Ở ĐÂY chứ không ở `shared/constants/error-codes.ts` (bảng chung đã chạm trần độ dài): interceptor
 * không biết các mã này nên mọi lệnh ghi của chấm chéo bật `skipErrorToast` và tự hiện câu bên dưới NGAY TRONG màn/hộp thoại.
 */
export const REVIEW_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  REVIEW_001: 'Lượt chấm đã đóng hoặc bạn không còn được giao chấm thẻ này.',
  REVIEW_002: 'Điểm chấm chưa khớp tiêu chí đánh giá. Kiểm tra lại từng tiêu chí.',
  REVIEW_003: 'Bạn đang là người thực hiện thẻ này nên không thể tự chấm.',
  REVIEW_004: 'Cấu hình chấm chéo chưa hợp lệ. Kiểm tra lại số lượt duyệt và tiêu chí.',
  REVIEW_005: 'Không có thành viên phù hợp để giao chấm.',
  REVIEW_006: 'Vui lòng ghi nhận xét khi yêu cầu sửa.',
  REVIEW_007: 'Thẻ không có lượt chấm đang mở.',
};

/** Câu lỗi cho người dùng: mã `REVIEW_*` → câu riêng, còn lại rơi về `toErrorMessage` chung (mạng, quyền, 5xx…). */
export function reviewErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  return (code && REVIEW_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/** Câu của tấm "Chưa thể hoàn thành" theo `409 TASK_002 REVIEW_REQUIRED`. */
export function moveBlockedText(details: {
  approvedCount: number;
  requiredReviews: number;
  roundStatus: ReviewRoundStatus | 'NONE';
}): { headline: string; hint: string } {
  if (details.roundStatus === 'OPEN') {
    return {
      headline: `Cần ${details.requiredReviews} lượt duyệt, đã có ${details.approvedCount}`,
      hint: 'Thẻ chỉ sang cột Hoàn thành được khi đủ lượt duyệt.',
    };
  }
  if (details.roundStatus === 'CHANGES_REQUESTED') {
    return {
      headline: 'Thẻ đang cần sửa theo yêu cầu của người chấm',
      hint: 'Sửa xong hãy đưa thẻ vào cột Review để được chấm lại.',
    };
  }
  return {
    headline: `Thẻ cần ${details.requiredReviews} lượt duyệt trước khi hoàn thành`,
    hint: 'Đưa thẻ vào cột Review để hệ thống giao cho bạn cùng nhóm chấm.',
  };
}

/** Câu lỗi tại MỘT ô điểm (tiêu chí hoặc điểm tự do): `max` = điểm tối đa của ô. */
export function scoreProblemText(problem: ScoreProblem, max: number): string {
  switch (problem) {
    case 'MISSING':
      return 'Chưa chấm ô này';
    case 'OUT_OF_RANGE':
      return `Điểm từ 0 đến ${max}`;
    case 'INVALID_STEP':
      return 'Điểm tính theo bước 0,5';
  }
}
