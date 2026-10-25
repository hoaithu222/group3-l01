import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * p4-05 (chấm chéo): thông báo `review.*` của BE (`be/src/modules/projects/services/review/review-notification.types.ts`).
 *  · `review.requested` / `review.reminder` (người chấm) → MÀN CHẤM `tasks/[taskId]/review`;
 *  · `review.shortage` (OWNER/ADMIN: nhóm thiếu người chấm) → cài đặt chấm chéo của bảng;
 *  · `review.cancelled` / `review.changes-requested` / `review.approved` / `review.waived` → chi tiết thẻ (khối Chấm chéo) — trả `null`
 *    để `notification-route.ts` dùng đường thẻ chung.
 * Push/hộp thư chỉ mang id (`taskId`, `boardId`, `workspaceId`, `roundId`) — KHÔNG điểm, KHÔNG nhận xét; màn đích tự tải lại và nói
 * "không còn khả dụng" khi BE trả 403/404. Thiếu `boardId`/`workspaceId` → `null` (nơi gọi rơi về đường thẻ chung/hộp thư).
 * Tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài.
 *
 * ⚠️ Ép kiểu `as Href` vì route mới chưa chắc đã có trong `.expo/types/router.d.ts` (sinh lúc `expo start`); chuỗi thật đúng ở mọi trường
 * hợp — cùng lý do `contribution-route.ts`. Đổi đường dẫn phải sửa CẢ `features/boards/utils/review-routes.ts`.
 */
export function isReviewType(type: string): boolean {
  return type.startsWith('review.');
}

export function reviewHref({ boardId, taskId, type, workspaceId }: NotificationTarget): Href | null {
  if (!boardId || !workspaceId) return null;
  if ((type === 'review.requested' || type === 'review.reminder') && taskId) {
    return `/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/review` as Href;
  }
  if (type === 'review.shortage') return `/workspaces/${workspaceId}/boards/${boardId}/review-settings` as Href;
  return null;
}
