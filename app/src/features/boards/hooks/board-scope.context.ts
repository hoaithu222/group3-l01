import { createContext, useContext } from 'react';

import type { MoveBlockedInfo } from '../api/reviews.types';

/**
 * Ngữ cảnh của MỘT bảng đang mở, do `BoardScopeProvider` (`[boardId]/_layout.tsx`)
 * cấp cho mọi màn con (Kanban, Cài đặt).
 *
 * `pendingMutations` = các `clientMutationId` của CHÍNH MÌNH còn đang bay
 * (app.md §5): nằm trong provider chứ không phải biến toàn cục để rời bảng là
 * tập này biến mất theo, không rò sang bảng kế tiếp.
 *
 * `activeBatchId` (p4-04 app.md §5) = lô dời lịch nền đang theo dõi. Đặt ở ĐÂY chứ không ở `KanbanScreen`: lệnh dời
 * bắt đầu từ chi tiết thẻ (modal chồng lên Kanban) hoặc Gantt, còn banner hiện ở Kanban/Gantt — ba màn cùng một
 * phạm vi bảng, rời bảng là mất (banner phục hồi bằng thông báo `TASK_RESCHEDULE_BATCH_DONE`).
 */
export interface BoardScopeValue {
  activeBatchId: string | null;
  boardId: string;
  pendingMutations: Set<string>;
  setActiveBatchId: (batchId: string | null) => void;
  /**
   * p4-05: `useMoveTask` gọi khi `409 TASK_002 REVIEW_REQUIRED` — tấm giải thích (`MoveBlockedSheet`) được `BoardScopeProvider` dựng MỘT
   * lần cho cả cụm màn (Kanban, chi tiết thẻ, Gantt). Tuỳ chọn: chỗ dựng ngữ cảnh thủ công (test) không có thì `useMoveTask` rơi về toast.
   */
  showMoveBlocked?: (info: MoveBlockedInfo) => void;
  wsId: string;
}

export const BoardScopeContext = createContext<BoardScopeValue | null>(null);

export function useBoardScopeValue(): BoardScopeValue {
  const value = useContext(BoardScopeContext);
  if (!value) {
    throw new Error('useBoardScopeValue phải nằm trong <BoardScopeProvider> ([boardId]/_layout.tsx).');
  }
  return value;
}
