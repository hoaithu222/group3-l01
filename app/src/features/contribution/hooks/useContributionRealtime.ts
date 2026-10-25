import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { NotificationCreatedEvent } from '@/core/notifications';
import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';

import type { BoardUpdatedEvent } from '../api/contribution.types';
import { contributionKeys } from '../queries/contribution.keys';

/** Loại thông báo của p4-06 (`contribution.export-ready` / `contribution.export-failed`). */
const EXPORT_NOTIFICATION_PREFIX = 'contribution.export';

/**
 * Realtime của màn đóng góp (app.md §4 "Realtime"):
 *  · `board:updated` mang `contributionChanged` (chủ nhóm vừa đổi công thức) → làm mới công thức + báo cáo MỌI kỳ + thẻ được tính.
 *    Các lần `board:updated` khác (đổi tên bảng, nhãn…) không đổi điểm nên bị bỏ qua — khác với danh sách thẻ của `boards`;
 *  · `notification:created` loại `contribution.export-*` → làm mới trạng thái lượt xuất đang theo dõi (nhanh hơn chờ nhịp 5 giây);
 *  · nối lại phòng sau khi mất kết nối: sự kiện trong lúc mất kết nối là mất hẳn ⇒ tải lại báo cáo.
 * Việc VÀO phòng `board:{id}` do `BoardScopeProvider` (layout `[boardId]`) lo — hook này chỉ NGHE.
 */
export function useContributionRealtime(boardId: string, exportId?: string): void {
  const queryClient = useQueryClient();

  useSocketEvent<BoardUpdatedEvent>(SocketEvent.BOARD_UPDATED, (payload) => {
    if (payload.boardId !== boardId || !payload.contributionChanged) return;
    void queryClient.invalidateQueries({ queryKey: contributionKeys.config(boardId) });
    void queryClient.invalidateQueries({ queryKey: contributionKeys.reportsAll(boardId) });
    void queryClient.invalidateQueries({ queryKey: contributionKeys.memberTasksAll(boardId) });
  });

  useSocketEvent<NotificationCreatedEvent>(SocketEvent.NOTIFICATION_CREATED, (event) => {
    if (!exportId || !event.type?.startsWith(EXPORT_NOTIFICATION_PREFIX)) return;
    const target = event.refs?.exportId;
    if (target && target !== exportId) return;
    void queryClient.invalidateQueries({ queryKey: contributionKeys.export(exportId) });
  });

  useEffect(
    () =>
      onRoomResync(() => {
        void queryClient.invalidateQueries({ queryKey: contributionKeys.reportsAll(boardId) });
      }),
    [boardId, queryClient],
  );
}
