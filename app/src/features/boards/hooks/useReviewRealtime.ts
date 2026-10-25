import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { NotificationCreatedEvent } from '@/core/notifications';
import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';

import type { ReviewUpdatedPayload } from '../api/reviews.types';
import { reviewKeys } from '../queries/reviews.keys';
import { applyReviewUpdatedToBoards } from '../utils/review-cache';

/**
 * `task:review-updated` (room `board:{id}`, đã vào ở `BoardScopeProvider`) → vá chip "Chờ duyệt 1/2" ở mọi cache bảng và làm mới khối
 * chấm chéo của thẻ đó (p4-05 app.md §4 "Realtime").
 *
 * ⛔ Sự kiện chỉ mang SỐ ĐẾM. Điểm/nhận xét đi qua `GET /tasks/:id/reviews` (BE lọc theo người xem) — nên ở đây chỉ `invalidate`, không
 * bao giờ ghi nội dung chấm vào cache từ socket.
 *
 * Mất kết nối rồi nối lại: sự kiện trong lúc mất là mất hẳn ⇒ tải lại mọi khối chấm chéo đang mở và "Cần chấm của tôi".
 */
export function useReviewRealtime(boardId: string): void {
  const queryClient = useQueryClient();

  useSocketEvent<ReviewUpdatedPayload>(SocketEvent.TASK_REVIEW_UPDATED, (payload) => {
    if (payload.boardId !== boardId) return;
    applyReviewUpdatedToBoards(queryClient, boardId, payload);
    void queryClient.invalidateQueries({ queryKey: reviewKeys.task(payload.taskId) });
    // Ai được giao/không còn phải chấm đã đổi ⇒ danh sách "Cần chấm" của tôi cũng có thể đổi.
    void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
  });

  useEffect(
    () =>
      onRoomResync(() => {
        void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      }),
    [queryClient],
  );
}

/** Thông báo `review.*` mới tới ⇒ "Cần chấm của tôi" tải lại (dùng ở nơi hiện số đếm/danh sách, không cần đang ở trong bảng). */
export function useReviewInboxRealtime(): void {
  const queryClient = useQueryClient();

  useSocketEvent<NotificationCreatedEvent>(SocketEvent.NOTIFICATION_CREATED, (event) => {
    if (!event.type?.startsWith('review.')) return;
    void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
  });
}
