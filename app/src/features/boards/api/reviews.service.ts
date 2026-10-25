import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  boardReviewConfigPath,
  MY_REVIEWS_PATH,
  taskReviewReassignPath,
  taskReviewsPath,
  taskReviewSubmitPath,
  taskReviewWaivePath,
} from './reviews.api';
import type {
  MyReviewItemDto,
  MyReviewsStatus,
  PutReviewConfigPayload,
  ReassignReviewPayload,
  ReassignReviewResult,
  ReviewConfigDto,
  ReviewRoundDto,
  SubmitReviewPayload,
  SubmitReviewResult,
  TaskReviewsDto,
} from './reviews.types';
import type { CursorPage } from './task-detail.types';

/** Số hàng mỗi trang "Cần chấm của tôi". */
export const MY_REVIEWS_PAGE_SIZE = 20;

/**
 * Chấm chéo (p4-05 be.md §4). Mọi lệnh GHI bật `skipErrorToast`: lỗi nghiệp vụ (`REVIEW_001..007`, `RES_003`) hiện TRONG
 * màn/hộp thoại đang nhập — toast tự tắt sau 4 giây còn người dùng đang sửa lại.
 */
export const reviewsService = {
  async getTask(taskId: string): Promise<TaskReviewsDto> {
    const response = await apiClient.get<TaskReviewsDto>(taskReviewsPath(taskId), { skipErrorToast: true });
    return unwrapData<TaskReviewsDto>(response);
  },

  /** `Idempotency-Key` sinh MỘT LẦN khi mở màn và dùng lại khi thử lại — mạng chậm bấm hai lần vẫn một lượt chấm. */
  async submit(reviewId: string, payload: SubmitReviewPayload, idempotencyKey: string): Promise<SubmitReviewResult> {
    const response = await apiClient.post<SubmitReviewResult>(taskReviewSubmitPath(reviewId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<SubmitReviewResult>(response);
  },

  async reassign(reviewId: string, payload: ReassignReviewPayload): Promise<ReassignReviewResult> {
    const response = await apiClient.post<ReassignReviewResult>(taskReviewReassignPath(reviewId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ReassignReviewResult>(response);
  },

  async waive(taskId: string, reason: string): Promise<ReviewRoundDto> {
    const response = await apiClient.post<ReviewRoundDto>(taskReviewWaivePath(taskId), { reason }, {
      skipErrorToast: true,
    });
    return unwrapData<ReviewRoundDto>(response);
  },

  async getConfig(boardId: string): Promise<ReviewConfigDto> {
    const response = await apiClient.get<ReviewConfigDto>(boardReviewConfigPath(boardId), { skipErrorToast: true });
    return unwrapData<ReviewConfigDto>(response);
  },

  async putConfig(boardId: string, payload: PutReviewConfigPayload): Promise<ReviewConfigDto> {
    const response = await apiClient.put<ReviewConfigDto>(boardReviewConfigPath(boardId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ReviewConfigDto>(response);
  },

  /**
   * `{ data: [...], meta: { nextCursor } }` — đọc `response.data` trực tiếp (không `unwrapData`) vì `data` là MẢNG hàng kèm
   * `meta` (cùng lý do `taskCommentsService.getPage`).
   */
  async mine(status: MyReviewsStatus, cursor?: string): Promise<CursorPage<MyReviewItemDto>> {
    const response = await apiClient.get<{ data: MyReviewItemDto[]; meta?: { nextCursor?: string | null } }>(
      MY_REVIEWS_PATH,
      { params: { cursor, limit: MY_REVIEWS_PAGE_SIZE, status }, skipErrorToast: true },
    );
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },
};
