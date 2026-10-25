import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { reviewsService } from '../api/reviews.service';
import type {
  MyReviewsStatus,
  PutReviewConfigPayload,
  ReassignReviewPayload,
  SubmitReviewPayload,
  TaskReviewDto,
  TaskReviewsDto,
} from '../api/reviews.types';
import { getHttpStatus } from '../utils/error-details';
import { applySubmitResult } from '../utils/review-cache';
import { boardKeys } from './boards.keys';
import { reviewKeys } from './reviews.keys';
import { taskKeys } from './task-detail.keys';

const NO_CURSOR = undefined as string | undefined;

/**
 * Khối chấm chéo của một thẻ (`GET /tasks/:id/reviews`). `initialData` = `TaskDetailDto.reviews` (BE trả kèm chi tiết thẻ) nên mở
 * chi tiết KHÔNG tốn thêm một lượt gọi; `staleTime` 30 giây, realtime `task:review-updated` làm mới sớm hơn. 404 KHÔNG thử lại.
 */
export function useTaskReviews(taskId: string, options: { enabled?: boolean; initialData?: TaskReviewsDto } = {}) {
  const queryClient = useQueryClient();
  return useQuery({
    enabled: options.enabled ?? true,
    initialData: options.initialData,
    // ⚠️ `initialData` lấy từ chi tiết thẻ ĐANG cache — có thể đã cũ. Thiếu mốc này thì React Query coi nó "vừa tải" và không
    // hỏi server trong 30 s (cùng cách `dependencies.queries.ts`).
    initialDataUpdatedAt: () => queryClient.getQueryState(taskKeys.detail(taskId))?.dataUpdatedAt,
    queryFn: () => reviewsService.getTask(taskId),
    queryKey: reviewKeys.task(taskId),
    retry: (failureCount, error) => getHttpStatus(error) !== 404 && failureCount < 1,
    staleTime: 30_000,
  });
}

export interface SubmitReviewVariables {
  boardId: string;
  /** Sinh MỘT LẦN khi mở màn, dùng lại cho mọi lần thử lại (`Idempotency-Key`). */
  idempotencyKey: string;
  payload: SubmitReviewPayload;
  review: Pick<TaskReviewDto, 'id'>;
}

/**
 * Nộp chấm (app.md §4): thành công → ghi `reviewKeys.task`, thẻ trong cache bảng (`reviewState`, cột nếu bị trả về IN_PROGRESS) và
 * làm mới "Cần chấm của tôi"; tải lại chi tiết + hoạt động của thẻ. Lỗi KHÔNG toast (màn tự hiện `REVIEW_*` đúng chỗ).
 */
export function useSubmitReview(taskId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: ({ idempotencyKey, payload, review }: SubmitReviewVariables) =>
      reviewsService.submit(review.id, payload, idempotencyKey),
    onSuccess: (result, { boardId }) => {
      applySubmitResult(queryClient, boardId, result, currentUserId);
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
    },
  });
}

/** Giao lại người chấm (OWNER/ADMIN): làm mới khối chấm chéo + hoạt động; toast "Đã ghi nhật ký". */
export function useReassignReview(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, reviewId }: { payload: ReassignReviewPayload; reviewId: string }) =>
      reviewsService.reassign(reviewId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.task(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
      showToast('success', 'Đã giao lại người chấm và ghi nhật ký.');
    },
  });
}

/** Miễn chấm (OWNER/ADMIN, có lý do): lượt `WAIVED` ⇒ thẻ được kéo sang Hoàn thành; làm mới thẻ ở mọi cache. */
export function useWaiveReview(taskId: string, boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) => reviewsService.waive(taskId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.task(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
      void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
      showToast('success', 'Đã miễn chấm và ghi nhật ký.');
    },
  });
}

export function useReviewConfig(boardId: string) {
  return useQuery({
    queryFn: () => reviewsService.getConfig(boardId),
    queryKey: reviewKeys.config(boardId),
    retry: (failureCount, error) => getHttpStatus(error) !== 404 && failureCount < 1,
    staleTime: 30_000,
  });
}

/**
 * `PUT /boards/:id/review-config` (CAS `expectedVersion`): ghi cấu hình mới vào cache + tải lại bảng (`Board.version` đổi). Bật/tắt
 * chấm chéo giữa chừng mở/huỷ lượt ở nền (job `review.backfill`) — chip trên thẻ tự đổi theo `task:review-updated`.
 * `RES_003`/`REVIEW_004` do màn xử lý (banner + giữ form / lỗi tại trường).
 */
export function useSaveReviewConfig(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PutReviewConfigPayload) => reviewsService.putConfig(boardId, payload),
    onSuccess: (config) => {
      queryClient.setQueryData(reviewKeys.config(boardId), config);
      void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    },
  });
}

/** "Cần chấm / Đã chấm của tôi" — cursor 20/trang; `staleTime` 60 giây (số đếm ở tab Tôi dùng trang đầu). */
export function useMyReviews(status: MyReviewsStatus, options: { enabled?: boolean } = {}) {
  // ⚠️ THỨ TỰ khoá quan trọng: `queryFn` phải đứng TRƯỚC `getNextPageParam` thì TypeScript mới suy ra kiểu trang (đảo lại → `last: unknown`).
  return useInfiniteQuery({
    queryKey: reviewKeys.mine(status),
    queryFn: ({ pageParam }) => reviewsService.mine(status, pageParam),
    initialPageParam: NO_CURSOR,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}
