import type { MyReviewsStatus } from '../api/reviews.types';

/**
 * Khoá React Query của chấm chéo (p4-05 app.md §4). Tiền tố `['reviews', …]` để MỘT `removeQueries(['reviews'])` dọn hết.
 *
 * `draft` (nháp chấm CHƯA gửi) cũng sống trong cache này thay vì một store zustand riêng: `wipeUserData()` gọi `queryClient.clear()`
 * nên đăng xuất/đổi tài khoản dọn nháp luôn — nội dung đánh giá là dữ liệu nhạy cảm, không được lưu đĩa và không được sót cho
 * người kế tiếp trên cùng máy (khoá còn mang `userId`).
 */
export const reviewKeys = {
  all: ['reviews'] as const,
  task: (taskId: string) => ['reviews', 'task', taskId] as const,
  config: (boardId: string) => ['reviews', 'config', boardId] as const,
  mineAll: ['reviews', 'mine'] as const,
  mine: (status: MyReviewsStatus) => ['reviews', 'mine', status] as const,
  draft: (userId: string, reviewId: string) => ['reviews', 'draft', userId, reviewId] as const,
};
