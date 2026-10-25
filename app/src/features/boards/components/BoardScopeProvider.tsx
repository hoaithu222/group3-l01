import { router } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import type { MoveBlockedInfo } from '../api/reviews.types';
import { BoardScopeContext } from '../hooks/board-scope.context';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { useBoardScope } from '../hooks/useBoardScope';
import { useRescheduleRealtime } from '../hooks/useRescheduleRealtime';
import { useReviewRealtime } from '../hooks/useReviewRealtime';
import { useTaskAttachmentFinalizer } from '../hooks/useTaskAttachmentUpload';
import { MoveBlockedSheet } from './review/MoveBlockedSheet';

/**
 * Bọc mọi màn của MỘT bảng (`[boardId]/_layout.tsx`): vào phòng realtime, nghe
 * sự kiện `board:*`/`task:*`, đưa người dùng ra khi mất quyền, và giữ tập
 * `pendingMutations` (Kanban) + `activeBatchId` (lô dời lịch nền, p4-04) dùng chung (app.md §1, §5). p4-05: nghe `task:review-updated`
 * (chip "Chờ duyệt 1/2") và dựng MỘT `MoveBlockedSheet` cho cả cụm màn — `useMoveTask` báo qua `showMoveBlocked` khi kéo thẻ sang DONE
 * mà chưa đủ lượt duyệt (Kanban, menu chuyển cột ở chi tiết thẻ đều đi qua đường này).
 *
 * Gắn Ở ĐÂY (không lặp ở từng màn con) để rời Kanban sang Cài đặt vẫn nhận
 * `board:updated`, và để room chỉ join MỘT lần cho cả cụm màn.
 */
export function BoardScopeProvider({
  boardId,
  children,
  wsId,
}: {
  boardId: string;
  children: ReactNode;
  wsId: string;
}) {
  // `useState` chứ không `useRef`: Set phải ổn định giữa các lần vẽ và ĐỌC được
  // trong lúc vẽ (React Compiler cấm đọc `ref.current` ở đó).
  const [pendingMutations] = useState(() => new Set<string>());
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  useBoardScope(wsId, boardId);
  useBoardRealtime(boardId, pendingMutations);
  // p3-03: gắn tệp đính kèm thẻ vào thẻ khi upload xong — sống suốt lúc còn trong bảng, không phụ thuộc màn chi tiết còn mở.
  useTaskAttachmentFinalizer(boardId);
  // p4-04: `board:rescheduled` + `task:updated { changed: dependencies }` → tải lại thẻ/Gantt/phụ thuộc đúng chỗ.
  useRescheduleRealtime(boardId);
  // p4-05: `task:review-updated` → chip trên thẻ + làm mới khối chấm chéo của thẻ.
  useReviewRealtime(boardId);
  const [moveBlocked, setMoveBlocked] = useState<MoveBlockedInfo | null>(null);
  const showMoveBlocked = useCallback((info: MoveBlockedInfo) => setMoveBlocked(info), []);

  const value = useMemo(
    () => ({ activeBatchId, boardId, pendingMutations, setActiveBatchId, showMoveBlocked, wsId }),
    [activeBatchId, boardId, pendingMutations, showMoveBlocked, wsId],
  );

  return (
    <BoardScopeContext value={value}>
      {children}
      <MoveBlockedSheet
        info={moveBlocked}
        onClose={() => setMoveBlocked(null)}
        onOpenTask={(taskId) => {
          setMoveBlocked(null);
          router.dismissTo({ params: { boardId, taskId, wsId }, pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]' });
        }}
      />
    </BoardScopeContext>
  );
}
