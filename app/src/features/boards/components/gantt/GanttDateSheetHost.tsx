import { useEffect } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { useSaveWithReschedule } from '../../hooks/useSaveWithReschedule';
import { useTaskDetailState } from '../../hooks/useTaskDetailState';
import { DateRangeSheet } from '../task/DateRangeSheet';
import { RescheduleWarningSheet } from '../task/RescheduleWarningSheet';

export interface GanttDateSheetHostProps {
  boardId: string;
  taskId: string;
  wsId: string;
  onClose: () => void;
}

/**
 * Tấm ngày cho MỘT thẻ đang chọn trên Gantt — đường thay thế cho kéo thanh (app.md §7: "chạm thanh → sheet ngày của
 * p3-03"). Tái dùng nguyên `DateRangeSheet` + luồng lưu/`TASK_006` của chi tiết thẻ (`useTaskDetailState` +
 * `useSaveWithReschedule`), nên đổi hạn lùi mà có thẻ sau bị ảnh hưởng cũng mở cùng tấm cảnh báo dời lịch.
 *
 * MOUNT theo thẻ đang chọn (nơi dùng render có điều kiện): chi tiết thẻ chỉ tải khi người dùng thật sự chạm một thanh —
 * Gantt có thể có 2.000 thẻ, ⛔ không tải chi tiết trước. Thẻ mất (404) hoặc không đủ quyền sửa thì báo và đóng ngay
 * thay vì treo một tấm không hiện.
 */
export function GanttDateSheetHost({ boardId, taskId, wsId, onClose }: GanttDateSheetHostProps) {
  const state = useTaskDetailState(boardId, taskId, wsId);
  const { access, detail, notFound } = state;
  const saver = useSaveWithReschedule({
    boardId,
    detail: detail.data,
    onDone: onClose,
    save: state.save,
    taskId,
  });

  const canEdit = Boolean(detail.data) && !detail.isPlaceholderData && access.canEdit;
  const cannotEdit = Boolean(detail.data) && !detail.isPlaceholderData && !access.canEdit;

  useEffect(() => {
    if (!notFound && !cannotEdit) return;
    showToast('info', notFound ? 'Thẻ không còn tồn tại' : 'Bạn không có quyền đổi ngày của thẻ này');
    onClose();
  }, [cannotEdit, notFound, onClose]);

  return (
    <>
      <DateRangeSheet
        due={detail.data?.dueDate ?? null}
        error={saver.error}
        saving={saver.saving}
        start={detail.data?.startDate ?? null}
        visible={canEdit}
        onClose={onClose}
        onConfirm={(change) => void saver.commit({ optimistic: change, patch: change })}
      />
      <RescheduleWarningSheet boardId={boardId} controller={saver.reschedule} />
    </>
  );
}
