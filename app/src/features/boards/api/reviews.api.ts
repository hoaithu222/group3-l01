/** Đường dẫn endpoint của p4-05 chấm chéo (be.md §4) — nối sau `appConfig.apiBaseUrl`. */

export function boardReviewConfigPath(boardId: string): string {
  return `/boards/${boardId}/review-config`;
}

export function taskReviewsPath(taskId: string): string {
  return `/tasks/${taskId}/reviews`;
}

export function taskReviewWaivePath(taskId: string): string {
  return `/tasks/${taskId}/review/waive`;
}

export function taskReviewSubmitPath(reviewId: string): string {
  return `/task-reviews/${reviewId}/submit`;
}

export function taskReviewReassignPath(reviewId: string): string {
  return `/task-reviews/${reviewId}/reassign`;
}

/** "Cần chấm của tôi" — cursor. */
export const MY_REVIEWS_PATH = '/me/reviews';
