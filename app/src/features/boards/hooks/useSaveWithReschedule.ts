import { useState } from 'react';

import type { ReschedulePreviewDto } from '../api/critical-path.types';
import type { TaskDetailDto } from '../api/task-detail.types';
import {
  CRITICAL_PATH_ERROR_MESSAGES,
  RESCHEDULE_PENDING,
} from '../constants/critical-path.constants';
import type { PatchTaskVariables } from '../queries/task-detail.queries';
import { rescheduleChangeFrom } from '../utils/reschedule-change';
import { useReschedule } from './useReschedule';

interface Options {
  boardId: string;
  detail: TaskDetailDto | undefined;
  taskId: string;
  /** Gọi khi lưu XONG — trực tiếp (`PATCH` thành công) hoặc sau khi dời lịch có xác nhận xong. */
  onDone: () => void;
  /** `useTaskDetailState().save` — tham số 2 nhận preview khi `PATCH` bị `TASK_006`. */
  save: (
    variables: PatchTaskVariables,
    onReschedule?: (preview: ReschedulePreviewDto) => void,
  ) => Promise<string | null>;
}

/**
 * "Lưu từ một tấm" + dời lịch có xác nhận, dùng chung cho tấm ngày của chi tiết thẻ và của Gantt (chạm thanh → tấm
 * ngày, app.md §7): lỗi hiện TRONG tấm (`error`), giữ giá trị người dùng đang nhập; `PATCH` bị `TASK_006` thì mở tấm
 * cảnh báo (`reschedule`) TRÊN tấm ngày — không đóng, không báo lỗi (chưa có gì sai). `onDone` chỉ chạy khi thực sự
 * xong, nên Huỷ ở tấm cảnh báo quay về tấm ngày còn nguyên giá trị.
 */
export function useSaveWithReschedule({ boardId, detail, save, taskId, onDone }: Options) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reschedule = useReschedule(boardId, { onApplied: onDone });

  const commit = async (variables: PatchTaskVariables) => {
    setSaving(true);
    // `false` khi không dựng được ngày mới (không có hạn) — rơi về câu lỗi thường thay vì treo tấm.
    let opened = true;
    const failure = await save(variables, (preview) => {
      const change = detail ? rescheduleChangeFrom(variables.patch, detail) : null;
      if (change) reschedule.begin(taskId, preview, change);
      else opened = false;
    });
    setSaving(false);

    if (failure === RESCHEDULE_PENDING) {
      if (!opened) setError(CRITICAL_PATH_ERROR_MESSAGES.TASK_006 ?? null);
      return;
    }
    if (failure) setError(failure);
    else onDone();
  };

  return { commit, error, reschedule, saving, clearError: () => setError(null) };
}
