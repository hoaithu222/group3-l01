import type { IconName } from '@/shared/ui/icon';

import type { ReviewState } from '../api/boards.types';

/** Chip chấm chéo trên thẻ Kanban (p4-05 app.md §2 `ReviewChip`): nhãn + icon + tông. Hàm THUẦN. */
export interface ReviewChipSpec {
  icon: IconName;
  label: string;
  tone: 'error' | 'neutral' | 'success' | 'warning';
}

/**
 * Chip trạng thái trên thẻ Kanban: CHỮ + icon, không chỉ màu (app.md §7). `NONE` → không vẽ. `PENDING` mà chưa biết tiến độ
 * (thẻ tạm/bản dựng thiếu `review`) chỉ ghi "Chờ duyệt".
 */
export function reviewChipSpec(
  state: ReviewState,
  progress?: { approvedCount: number; requiredReviews: number } | null,
): ReviewChipSpec | null {
  switch (state) {
    case 'PENDING':
      return {
        icon: 'timer',
        label: progress ? `Chờ duyệt ${progress.approvedCount}/${progress.requiredReviews}` : 'Chờ duyệt',
        tone: 'warning',
      };
    case 'CHANGES_REQUESTED':
      return { icon: 'edit', label: 'Cần sửa', tone: 'error' };
    case 'APPROVED':
      return { icon: 'checkmark-circle', label: 'Đã duyệt', tone: 'success' };
    default:
      return null;
  }
}

/**
 * Gợi ý vùng thả khi KÉO thẻ qua cột Hoàn thành (app.md §3 Kanban): chỉ khi CHẮC thẻ chưa đủ duyệt (`PENDING`/`CHANGES_REQUESTED`) — thẻ
 * `NONE` có thể thuộc bảng không bật chấm chéo nên KHÔNG đoán. Đây chỉ là gợi ý: thả vẫn gửi, server quyết (`TASK_002 REVIEW_REQUIRED`).
 */
export function dropReviewHint(state: ReviewState, targetKind: string | undefined, sameColumn: boolean): string | null {
  if (targetKind !== 'DONE' || sameColumn) return null;
  return state === 'PENDING' || state === 'CHANGES_REQUESTED' ? 'Cần duyệt trước' : null;
}

/** Câu đọc cho trình đọc màn hình của chip ("Chờ duyệt: đã có 1 trên 2 lượt duyệt"). */
export function reviewChipA11yLabel(
  state: ReviewState,
  progress?: { approvedCount: number; requiredReviews: number } | null,
): string | null {
  if (state === 'PENDING') {
    return progress
      ? `Chờ duyệt: đã có ${progress.approvedCount} trên ${progress.requiredReviews} lượt duyệt`
      : 'Chờ duyệt';
  }
  if (state === 'CHANGES_REQUESTED') return 'Thẻ cần sửa theo yêu cầu của người chấm';
  if (state === 'APPROVED') return 'Thẻ đã đủ lượt duyệt';
  return null;
}
