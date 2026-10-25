import type { IconName } from '@/shared/ui/icon';

import type {
  ReviewCancelReason,
  ReviewRoundDto,
  ReviewRoundStatus,
  RoundCloseReason,
  TaskReviewDto,
  TaskReviewStatus,
} from '../api/reviews.types';

/** Câu tiếng Việt cho TRẠNG THÁI lượt chấm và người chấm (p4-05 app.md §2 `utils/review-text.ts`). Hàm THUẦN. */

/** Trạng thái của MỘT lượt chấm cá nhân. `SUBMITTED` = đã nộp nhưng người xem chưa được biết quyết định. */
export function reviewStatusText(review: Pick<TaskReviewDto, 'status'>): string {
  switch (review.status) {
    case 'PENDING':
      return 'Chưa chấm';
    case 'APPROVED':
      return 'Đã duyệt';
    case 'REQUEST_CHANGES':
      return 'Yêu cầu sửa';
    case 'SUBMITTED':
      return 'Đã chấm';
    case 'REASSIGNED':
      return 'Đã giao lại';
    case 'CANCELLED':
      return 'Đã huỷ';
  }
}

export const CANCEL_REASON_TEXT: Readonly<Record<ReviewCancelReason, string>> = {
  BECAME_ASSIGNEE: 'Người chấm đã trở thành người làm thẻ',
  MANUAL: 'Quản trị viên đã giao lại hoặc bỏ lượt này',
  MEMBER_LEFT: 'Người chấm không còn trong nhóm',
  REVIEW_DISABLED: 'Chấm chéo đã bị tắt',
  ROUND_CLOSED: 'Lượt chấm đã đóng',
};

export const CLOSE_REASON_TEXT: Readonly<Record<RoundCloseReason, string>> = {
  APPROVED: 'Đủ lượt duyệt',
  CHANGES_REQUESTED: 'Có người yêu cầu sửa',
  LEFT_REVIEW: 'Thẻ rời cột Review',
  REVIEW_DISABLED: 'Chấm chéo đã bị tắt',
  TASK_DELETED: 'Thẻ đã bị xoá',
  WAIVED: 'Được miễn chấm',
};

/** Tiêu đề một lượt: "Lượt 2 · Chờ duyệt 1/2". Tự duyệt/miễn chấm nói rõ vì sao KHÔNG có điểm. */
export function roundStatusText(round: Pick<ReviewRoundDto, 'approvedCount' | 'autoApproved' | 'requiredReviews' | 'status'>): string {
  switch (round.status) {
    case 'OPEN':
      return `Chờ duyệt ${round.approvedCount}/${round.requiredReviews}`;
    case 'APPROVED':
      return round.autoApproved ? 'Tự duyệt do nhóm không đủ người chấm' : 'Đã duyệt';
    case 'CHANGES_REQUESTED':
      return 'Cần sửa';
    case 'WAIVED':
      return 'Được miễn chấm';
    case 'CANCELLED':
      return 'Đã huỷ';
  }
}

export function roundTitle(round: Pick<ReviewRoundDto, 'round'>): string {
  return `Lượt ${round.round}`;
}

/** Icon đi cùng trạng thái lượt. */
export function roundIcon(status: ReviewRoundStatus): IconName {
  switch (status) {
    case 'OPEN':
      return 'timer';
    case 'APPROVED':
    case 'WAIVED':
      return 'checkmark-circle';
    case 'CHANGES_REQUESTED':
      return 'edit';
    case 'CANCELLED':
      return 'cancel';
  }
}

/** Icon + màu ngữ nghĩa cho trạng thái MỘT lượt chấm cá nhân (chữ đi kèm — màu không phải dấu hiệu duy nhất). */
export function reviewStatusVisual(status: TaskReviewStatus): { color: 'error' | 'fg-2' | 'success'; icon: IconName } {
  switch (status) {
    case 'PENDING':
      return { color: 'fg-2', icon: 'timer' };
    case 'REQUEST_CHANGES':
      return { color: 'error', icon: 'edit' };
    case 'CANCELLED':
    case 'REASSIGNED':
      return { color: 'fg-2', icon: 'cancel' };
    case 'APPROVED':
    case 'SUBMITTED':
      return { color: 'success', icon: 'checkmark-circle' };
  }
}
