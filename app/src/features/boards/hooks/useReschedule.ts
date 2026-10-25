import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type {
  RescheduleApplyResult,
  RescheduleChange,
  ReschedulePreviewDto,
} from '../api/critical-path.types';
import { boardKeys } from '../queries/boards.keys';
import { useApplyReschedule } from '../queries/reschedule.queries';
import { TASK_CONFLICT_MESSAGE } from '../queries/task-actions.queries';
import { taskKeys } from '../queries/task-detail.keys';
import { criticalPathErrorMessage, readPreviewFromError } from '../utils/critical-path-errors';
import { getErrorCode } from '../utils/error-details';
import { batchRunningText, rescheduleSummary } from '../utils/reschedule-text';
import { useBoardScopeValue } from './board-scope.context';

/** Một lần cảnh báo đang mở: thẻ nguồn + kế hoạch (preview) + ngày mới người dùng muốn đặt. */
export interface RescheduleSession {
  change: RescheduleChange;
  error: string | null;
  preview: ReschedulePreviewDto;
  /** `TASK_019`: kế hoạch vừa được THAY bằng bản mới — tấm hiện banner "Lịch vừa thay đổi, hãy xem lại". */
  refreshed: boolean;
  taskId: string;
}

export interface UseRescheduleOptions {
  /** Gọi sau khi dời XONG (`200` hoặc `202`) — nơi gọi đóng tấm ngày/khôi phục thanh. */
  onApplied?: () => void;
}

/**
 * Luồng dời lịch có xác nhận (app.md §2 `hooks/useReschedule.ts`): mở tấm cảnh báo với một preview → xác nhận →
 * `TASK_019` thay danh sách → `200` báo kết quả / `202` theo dõi lô nền. Dùng chung cho `PATCH` bị `TASK_006` (chi tiết
 * thẻ) và kéo thanh Gantt — nên `begin` nhận `taskId` thay vì gắn cứng một thẻ.
 *
 *  · **Huỷ KHÔNG gọi mạng** — chỉ đóng tấm; `PATCH`/kéo chưa ghi gì nên không có gì để hoàn tác.
 *  · `expectedVersion` = `preview.source.version`: đúng phiên bản thẻ nguồn mà kế hoạch được tính. Sau `TASK_019` nó
 *    là version của preview MỚI, nên nút "Dời lịch" dùng token mới chứ không lặp lại token cũ.
 *  · `RES_003` (thẻ nguồn vừa bị sửa): kế hoạch chắc chắn cũ nhưng preview mới phải tính lại từ ngày người dùng đặt —
 *    đóng tấm, tải lại thẻ, để họ bấm Lưu lần nữa (PATCH → `TASK_006` với preview đúng).
 */
export function useReschedule(boardId: string, options: UseRescheduleOptions = {}) {
  const queryClient = useQueryClient();
  const { setActiveBatchId } = useBoardScopeValue();
  const [session, setSession] = useState<RescheduleSession | null>(null);

  const apply = useApplyReschedule(boardId, (result: RescheduleApplyResult) => {
    setSession(null);
    if (result.kind === 'applied') {
      showToast('success', rescheduleSummary(result.applied.length, result.skipped));
    } else {
      setActiveBatchId(result.batchId);
      showToast('info', batchRunningText({ affectedCount: result.affectedCount, appliedCount: 0 }));
    }
    options.onApplied?.();
  });

  const begin = (taskId: string, preview: ReschedulePreviewDto, change: RescheduleChange) =>
    setSession({ change, error: null, preview, refreshed: false, taskId });

  const cancel = () => setSession(null);

  const confirm = () => {
    if (!session || apply.isPending) return;
    const { change, preview, taskId } = session;

    apply.mutate(
      {
        payload: { ...change, expectedVersion: preview.source.version, previewToken: preview.previewToken },
        taskId,
      },
      {
        onError: (error) => {
          const code = getErrorCode(error);
          const fresh = code === 'TASK_019' ? readPreviewFromError(error) : null;
          if (fresh) {
            setSession({ change, error: null, preview: fresh, refreshed: true, taskId });
            return;
          }
          if (code === 'RES_003') {
            setSession(null);
            void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
            void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
            showToast('warning', TASK_CONFLICT_MESSAGE);
            return;
          }
          setSession((current) => current && { ...current, error: criticalPathErrorMessage(error) });
        },
      },
    );
  };

  return { applying: apply.isPending, begin, cancel, confirm, session };
}

export type RescheduleController = ReturnType<typeof useReschedule>;
