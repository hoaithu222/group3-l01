import { useMemo, useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';

import type { BoardColumn, BoardLabel } from '../api/boards.types';
import type { ReschedulePreviewDto } from '../api/critical-path.types';
import { RESCHEDULE_PENDING } from '../constants/critical-path.constants';
import { useBoard } from '../queries/boards.queries';
import {
  useTaskDetail,
  usePatchTask,
  type PatchTaskVariables,
} from '../queries/task-detail.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { readPreviewFromError } from '../utils/critical-path-errors';
import { getErrorCode, getHttpStatus } from '../utils/error-details';
import { resolveTaskAccess } from '../utils/task-permissions';
import { useTaskRealtime } from './useTaskRealtime';

export const CONFLICT_SAVE_MESSAGE =
  'Thẻ vừa được người khác thay đổi — đã tải bản mới. Kiểm tra lại rồi lưu.';

const NO_LABELS: BoardLabel[] = [];

/**
 * Gom dữ liệu + quyền + hành động lưu của màn chi tiết để `TaskDetailScreen` chỉ còn vẽ (app.md §4:
 * mọi logic nghiệp vụ nằm trong hook). Quyền = `myPermissions` của BE VÀ online VÀ bảng/nhóm chưa
 * lưu trữ VÀ thẻ chưa xoá (`resolveTaskAccess`).
 *
 * `save` trả về CÂU LỖI (hoặc `null` khi xong) thay vì ném: sheet giữ nguyên giá trị đang nhập và tự
 * hiện câu đó ngay trong sheet (app.md §4 "409 → rollback + banner + refetch, giữ giá trị trong sheet").
 * Riêng `RESCHEDULE_PENDING`: `PATCH` bị `TASK_006` và `onReschedule` đã được gọi với preview — chưa phải lỗi.
 */
export function useTaskDetailState(boardId: string, taskId: string, wsId: string) {
  const detail = useTaskDetail(boardId, taskId);
  const board = useBoard(boardId);
  const workspace = useWorkspaceBoardAccess(wsId);
  const connection = useConnectionState();
  const patch = usePatchTask(boardId, taskId);
  const [conflict, setConflict] = useState(false);
  useTaskRealtime(taskId);

  const archived = Boolean(board.data?.archivedAt) || workspace.data?.status === 'ARCHIVED';
  const offline = connection === 'offline';
  const access = resolveTaskAccess(detail.data, {
    archived,
    offline,
    placeholder: detail.isPlaceholderData,
  });

  const columns: BoardColumn[] = useMemo(
    () => [...(board.data?.columns ?? [])].sort((a, b) => a.order - b.order),
    [board.data?.columns],
  );
  const labelList = board.data?.labels ?? NO_LABELS;
  const labels = useMemo(() => new Map(labelList.map((label) => [label.id, label])), [labelList]);
  const isAdmin = workspace.data?.myRole === 'OWNER' || workspace.data?.myRole === 'ADMIN';

  const save = async (
    variables: PatchTaskVariables,
    onReschedule?: (preview: ReschedulePreviewDto) => void,
  ): Promise<string | null> => {
    try {
      await patch.mutateAsync(variables);
      setConflict(false);
      return null;
    } catch (error) {
      // p4-04: lùi hạn làm dời lịch các thẻ sau → BE KHÔNG ghi gì, trả `TASK_006 { preview }`. Mutation đã hoàn tác
      // bản optimistic; nơi gọi (tấm ngày) mở tấm cảnh báo và giữ nguyên giá trị người dùng đang nhập.
      if (getErrorCode(error) === 'TASK_006' && onReschedule) {
        const preview = readPreviewFromError(error);
        if (preview) {
          onReschedule(preview);
          return RESCHEDULE_PENDING;
        }
      }
      if (getErrorCode(error) === 'RES_003') {
        setConflict(true);
        void detail.refetch();
        return CONFLICT_SAVE_MESSAGE;
      }
      return toErrorMessage(error);
    }
  };

  return {
    access,
    archived,
    board,
    columns,
    conflict,
    detail,
    dismissConflict: () => setConflict(false),
    isAdmin,
    labelList,
    labels,
    notFound: getHttpStatus(detail.error) === 404,
    offline,
    save,
  };
}
