import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';
import { useBreakpoint } from '@/shared/theme';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { BoardColumn, BoardLabel, TaskCardDto } from '../api/boards.types';
import type { TaskA11yAction } from '../components/kanban/TaskCardMini';
import { DRAG_MODE } from '../constants/kanban.constants';
import { useBoard } from '../queries/boards.queries';
import { useBoardTasks, useCreateTask, useLoadFullColumn, type CreateTaskInput } from '../queries/tasks.queries';
import { useAssignToMe, useDeleteTask } from '../queries/task-actions.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { canCreateBoard, hasBoardPermission, resolveBoardPermissions } from '../utils/board-permissions';
import { boardGanttHref } from '../utils/board-routes';
import { planMove, type MoveIntent } from '../utils/plan-move';
import { useBoardScopeValue } from './board-scope.context';
import { useBoardFilter } from './useBoardFilter';
import { useMoveTask, type MoveTaskInput } from './useMoveTask';

const A11Y_INTENT: Record<TaskA11yAction, MoveIntent> = {
  moveDown: { kind: 'shortcut', shortcut: 'down' },
  moveUp: { kind: 'shortcut', shortcut: 'up' },
  nextColumn: { direction: 1, kind: 'adjacentColumn' },
  previousColumn: { direction: -1, kind: 'adjacentColumn' },
};

const EMPTY_LABELS: BoardLabel[] = [];

/**
 * Gom dữ liệu + quyền + hành động của màn Kanban để `KanbanScreen` chỉ còn vẽ
 * (`app.md` §4: mọi logic nghiệp vụ nằm trong hook, không trong component).
 *
 * Quyền kéo/thêm thẻ = quyền BE trả (`myPermissions`) VÀ đang online VÀ bảng/nhóm
 * chưa lưu trữ; mất một trong ba là chỉ-đọc (`app.md` §3 dòng Kanban, cột Offline).
 */
export function useKanbanBoard(wsId: string, boardId: string) {
  const { activeBatchId, pendingMutations, setActiveBatchId } = useBoardScopeValue();
  // p4-04: "Dòng thời gian" chỉ có khi cờ phân hệ `project` BẬT; chưa biết (`undefined`) thì coi như chưa bật.
  const timelineEnabled = useFeature('project') === true;
  const { isTablet } = useBreakpoint();
  const connection = useConnectionState();
  const board = useBoard(boardId);
  const access = useWorkspaceBoardAccess(wsId);
  const filterState = useBoardFilter(boardId);
  const tasks = useBoardTasks(boardId, filterState.filter, filterState.ready);
  const move = useMoveTask(boardId, pendingMutations);
  const createTask = useCreateTask(boardId, filterState.filter, pendingMutations);
  const loadFull = useLoadFullColumn(boardId, filterState.filter);
  const [menuTask, setMenuTask] = useState<TaskCardDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskCardDto | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<TaskCardDto | null>(null);
  const assignToMe = useAssignToMe(boardId);
  const deleteTask = useDeleteTask(boardId);
  const meId = useAuthStore((state) => state.user?.id);

  const columns: BoardColumn[] = useMemo(
    () => [...(board.data?.columns ?? [])].sort((a, b) => a.order - b.order),
    [board.data?.columns],
  );
  const labelList = board.data?.labels ?? EMPTY_LABELS;
  const labels = useMemo(() => new Map(labelList.map((label) => [label.id, label])), [labelList]);

  const archived = Boolean(board.data?.archivedAt) || access.data?.status === 'ARCHIVED';
  const permissions = resolveBoardPermissions(board.data?.myPermissions, { archived });
  const offline = connection === 'offline';
  // "Giao cho tôi" = sửa trường thẻ (`TASK_UPDATE`); "Xoá thẻ" trên MENU chỉ cho người xoá được thẻ của người khác
  // (`TASK_DELETE`) — thẻ mini không mang `createdBy`, nên người tạo (MEMBER) xoá ở màn chi tiết (`myPermissions.delete`).
  const canAssign = !archived && !offline && hasBoardPermission(board.data?.myPermissions, 'TASK_UPDATE');
  const canDelete = permissions.canDeleteAnyTask && !offline;
  const canMove = permissions.canMoveTask && !offline;
  // p3-02/p3-03 P1: nhân bản bảng = tạo bảng trong nhóm (OWNER/ADMIN, nhóm đang hoạt động); nhân bản thẻ = quyền tạo thẻ (`canCreate` bên dưới).
  const canDuplicateBoard = !offline && canCreateBoard(access.data);
  const canCreate = permissions.canCreateTask && !offline;
  const dragMode = isTablet ? DRAG_MODE.tablet : DRAG_MODE.phone;
  const byColumn = tasks.data?.columns ?? {};

  const onMove = (input: MoveTaskInput) => move.move(input);
  const openTaskById = (taskId: string) =>
    router.push({
      params: { boardId, taskId, wsId },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });

  return {
    activeBatchId,
    archived,
    board,
    canAssign,
    canCreate,
    canDelete,
    canDuplicateBoard,
    canMove,
    columns,
    dragEnabled: canMove && dragMode !== 'off',
    dragWithinColumnOnly: dragMode === 'within-column',
    filterState,
    hasMore: tasks.data?.hasMore ?? {},
    labelList,
    labels,
    deleteTarget,
    deletePending: deleteTask.isPending,
    duplicateTarget,
    menuTask,
    meId,
    offline,
    permissions,
    tasks,
    tasksByColumn: byColumn,
    onA11yAction: (task: TaskCardDto, action: TaskA11yAction) => {
      const plan = planMove(task, columns, byColumn, A11Y_INTENT[action]);
      if (plan && canMove) onMove(plan);
    },
    // Lỗi tạo thẻ do `useCreateTask` tự báo (onError của hook) — ⛔ đừng thêm `{ onError }` ở đây: callback theo lượt `mutate`
    // chỉ chạy cho lượt MỚI NHẤT, thêm thẻ liên tiếp là lỗi của thẻ trước im lặng.
    onCreate: (input: CreateTaskInput) => createTask.mutate(input),
    onAssignToMe: (task: TaskCardDto) => assignToMe.mutate(task),
    onConfirmDelete: (taskId: string) =>
      deleteTask.mutate(taskId, { onSettled: () => setDeleteTarget(null) }),
    onLoadMore: (columnId: string) => loadFull.mutate(columnId),
    onMove,
    onOpenTask: (task: TaskCardDto) => openTaskById(task.id),
    openSettings: () =>
      router.push({ params: { boardId, wsId }, pathname: '/workspaces/[wsId]/boards/[boardId]/settings' }),
    setDeleteTarget,
    setDuplicateTarget,
    setMenuTask,
    timelineEnabled,
    dismissBatch: () => setActiveBatchId(null),
    onOpenTaskId: openTaskById,
    openTimeline: () => router.push(boardGanttHref(wsId, boardId)),
  };
}
