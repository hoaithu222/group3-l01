import { useEffect, useMemo, useState } from 'react';

import { readJson, writeJson } from '@/core/storage/app-storage';
import { useConnectionState } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBreakpoint } from '@/shared/theme';

import { DEFAULT_GANTT_RANGE, type GanttRangeKey } from '../constants/critical-path.constants';
import { useBoard } from '../queries/boards.queries';
import { useGantt } from '../queries/gantt.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { resolveBoardPermissions } from '../utils/board-permissions';
import { ganttRangeFor, ganttRangeStorageKey, isGanttRangeKey } from '../utils/gantt-range';
import { useBoardScopeValue } from './board-scope.context';

/**
 * Gom dữ liệu + quyền + trạng thái của màn Gantt (app.md §4–§5) để `GanttScreen` chỉ còn vẽ:
 *  · mức xem (2 tuần/tháng/quý) NHỚ giữa các lần mở qua `AsyncStorage` `boards:gantt-range:<userId>:<boardId>` — màn
 *    ĐỢI đọc xong (`ready`) mới gọi API, tránh tải hai khoảng (mặc định rồi đã lưu) và nháy giữa hai kết quả;
 *  · `canMove` = quyền kéo thẻ của bảng (`TASK_UPDATE_STATUS`, cũng là quyền dời lịch) VÀ online VÀ chưa lưu trữ —
 *    thiếu một trong ba là chỉ-đọc (tắt kéo, chạm mở chi tiết thay vì tấm ngày);
 *  · `tablet` (`useBreakpoint`) quyết định biểu đồ hay danh sách mốc; người dùng vẫn chuyển được sang danh sách.
 */
export function useGanttBoard(wsId: string, boardId: string) {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous';
  const { activeBatchId, setActiveBatchId } = useBoardScopeValue();
  const { isTablet } = useBreakpoint();
  const connection = useConnectionState();
  const enabled = useFeature('project');
  const board = useBoard(boardId);
  const access = useWorkspaceBoardAccess(wsId);
  const [rangeKey, setRangeKey] = useState<GanttRangeKey>(DEFAULT_GANTT_RANGE);
  const [ready, setReady] = useState(false);
  const [listView, setListView] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readJson<string>(ganttRangeStorageKey(userId, boardId)).then((saved) => {
      if (cancelled) return;
      if (isGanttRangeKey(saved)) setRangeKey(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, userId]);

  const range = useMemo(() => ganttRangeFor(rangeKey), [rangeKey]);
  const gantt = useGantt(boardId, range, ready && enabled !== false);

  const archived = Boolean(board.data?.archivedAt) || access.data?.status === 'ARCHIVED';
  const offline = connection === 'offline';
  const permissions = resolveBoardPermissions(board.data?.myPermissions, { archived });
  const columns = board.data?.columns;
  // Hàng Gantt nhóm theo cột (app.md §3) — thứ tự cột của bảng; memo theo mảng cột để biểu đồ không sắp lại mỗi lần vẽ.
  const columnOrder = useMemo(
    () => [...(columns ?? [])].sort((a, b) => a.order - b.order).map((column) => column.id),
    [columns],
  );

  return {
    activeBatchId,
    archived,
    board,
    columnOrder,
    /** Cờ phân hệ `project` TẮT (đã biết chắc) — màn thay bằng "Tính năng này hiện chưa được bật". */
    featureOff: enabled === false,
    gantt,
    listView,
    offline,
    rangeKey,
    /** Điện thoại luôn là danh sách; tablet mặc định biểu đồ. */
    showChart: isTablet && !listView,
    canMove: permissions.canMoveTask && !offline,
    dismissBatch: () => setActiveBatchId(null),
    selectRange: (key: GanttRangeKey) => {
      setRangeKey(key);
      void writeJson(ganttRangeStorageKey(userId, boardId), key);
    },
    toggleListView: () => setListView((current) => !current),
    tablet: isTablet,
  };
}
