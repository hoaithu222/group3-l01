import type { QueryClient } from '@tanstack/react-query';

import type { ReviewState, TaskCardDto } from '../api/boards.types';
import type {
  ReviewRoundStatus,
  ReviewUpdatedPayload,
  SubmitReviewResult,
  TaskReviewsDto,
} from '../api/reviews.types';
import { applyEventToBoardCaches } from '../hooks/board-cache';
import { reviewKeys } from '../queries/reviews.keys';
import { updateCardInBoardCaches } from './task-cache';

/**
 * Vá cache cho chấm chéo (p4-05 app.md §4). Hàm THUẦN trừ những hàm nhận `QueryClient`.
 *
 * ⛔ KHÔNG bao giờ ghi điểm/nhận xét vào cache từ SOCKET: `task:review-updated` chỉ mang số đếm, điểm luôn đi qua `GET /tasks/:id/reviews`
 * (BE lọc theo người xem). Ở đây chỉ có `SubmitReviewResult` — phản hồi của CHÍNH lượt nộp — được ghi thẳng vào `reviewKeys.task`.
 */

/** `reviewState` của thẻ ứng với trạng thái lượt (đúng ánh xạ BE: tự duyệt/miễn chấm đều là APPROVED, huỷ = NONE). */
export function reviewStateOfRound(status: ReviewRoundStatus): ReviewState {
  switch (status) {
    case 'OPEN':
      return 'PENDING';
    case 'APPROVED':
    case 'WAIVED':
      return 'APPROVED';
    case 'CHANGES_REQUESTED':
      return 'CHANGES_REQUESTED';
    case 'CANCELLED':
      return 'NONE';
  }
}

export interface ReviewProgress {
  approvedCount: number;
  requiredReviews: number;
}

/** Thẻ mini với `reviewState` mới + tiến độ (chỉ giữ tiến độ khi còn `PENDING`). */
export function withReviewState(
  card: TaskCardDto,
  state: ReviewState,
  progress: ReviewProgress | null,
): TaskCardDto {
  if (card.reviewState === state && (state !== 'PENDING' || sameProgress(card.review, progress))) return card;
  const next: TaskCardDto = { ...card, reviewState: state };
  if (state === 'PENDING') next.review = progress;
  else delete next.review;
  return next;
}

function sameProgress(a: ReviewProgress | null | undefined, b: ReviewProgress | null): boolean {
  return (a?.approvedCount ?? -1) === (b?.approvedCount ?? -1) && (a?.requiredReviews ?? -1) === (b?.requiredReviews ?? -1);
}

/** `task:review-updated` → chip trên thẻ ở MỌI cache bảng (bỏ qua version: lượt chấm không tăng `Task.version`). */
export function applyReviewUpdatedToBoards(
  queryClient: QueryClient,
  boardId: string,
  payload: Pick<ReviewUpdatedPayload, 'approvedCount' | 'requiredReviews' | 'status' | 'taskId'>,
): void {
  const state = reviewStateOfRound(payload.status);
  const progress = state === 'PENDING' ? { approvedCount: payload.approvedCount, requiredReviews: payload.requiredReviews } : null;
  updateCardInBoardCaches(queryClient, boardId, payload.taskId, (card) => withReviewState(card, state, progress));
}

/**
 * Trộn phản hồi nộp chấm vào `TaskReviewsDto` đã có: lượt hiện tại + review của mình (đã có điểm, vì người nộp được xem kết quả của
 * chính mình) và tắt quyền nộp. Chưa có bản cũ ⇒ `undefined` để nơi gọi `invalidate` thay vì bịa một `TaskReviewsDto` thiếu trường.
 */
export function mergeSubmitIntoReviews(
  previous: TaskReviewsDto | undefined,
  result: SubmitReviewResult,
): TaskReviewsDto | undefined {
  if (!previous) return undefined;
  return {
    ...previous,
    currentRound: result.round,
    myPermissions: { ...previous.myPermissions, submit: false },
    myReview: result.review,
  };
}

/**
 * Ghi kết quả nộp chấm vào cache: `reviewKeys.task`, thẻ trong các cache bảng (`reviewState`; nếu Yêu cầu sửa đẩy thẻ về cột
 * IN_PROGRESS thì áp như `task:moved` để thẻ đổi cột ngay), và làm mới "Cần chấm của tôi".
 */
export function applySubmitResult(queryClient: QueryClient, boardId: string, result: SubmitReviewResult, currentUserId?: string): void {
  const taskId = result.task.id;
  const merged = mergeSubmitIntoReviews(queryClient.getQueryData<TaskReviewsDto>(reviewKeys.task(taskId)), result);
  if (merged) queryClient.setQueryData(reviewKeys.task(taskId), merged);
  else void queryClient.invalidateQueries({ queryKey: reviewKeys.task(taskId) });

  // ⚠️ THỨ TỰ: áp `moved` TRƯỚC — reducer bỏ sự kiện có `version <=` bản đã có, nên ghi `version` mới vào thẻ rồi mới áp thì lượt đổi cột bị nuốt.
  applyEventToBoardCaches(
    queryClient,
    boardId,
    {
      patch: {
        columnId: result.task.columnId,
        columnKind: result.task.columnKind,
        completedAt: null,
        id: taskId,
        position: result.task.position,
        version: result.task.version,
      },
      type: 'moved',
    },
    currentUserId,
  );
  const state = result.task.reviewState;
  const progress = state === 'PENDING' ? { approvedCount: result.round.approvedCount, requiredReviews: result.round.requiredReviews } : null;
  updateCardInBoardCaches(queryClient, boardId, taskId, (card) => withReviewState(card, state, progress));
  void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
}
