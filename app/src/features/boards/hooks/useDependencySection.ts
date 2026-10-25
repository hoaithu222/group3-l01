import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { DependencyTaskDto } from '../api/critical-path.types';
import {
  useAddDependency,
  useRemoveDependency,
  useTaskDependencies,
  type DependencyDirection,
  type DependencyVariables,
} from '../queries/dependencies.queries';
import { criticalPathErrorMessage } from '../utils/critical-path-errors';
import { useTaskLookup } from './useTaskLookup';

/**
 * Logic của khối "Phụ thuộc" trong chi tiết thẻ (app.md §3): danh sách, mở tấm chọn thẻ theo HƯỚNG, thêm, gỡ có xác
 * nhận. Lỗi nghiệp vụ (`TASK_005/017/018/021`) hiện TRONG tấm chọn — người dùng sửa lại lựa chọn ngay tại đó, toast tự
 * tắt sau 4 giây nên không hợp; lỗi gỡ (không có tấm để hiện) mới dùng toast.
 */
export function useDependencySection(boardId: string, taskId: string) {
  const dependencies = useTaskDependencies(taskId);
  const add = useAddDependency(boardId, taskId);
  const remove = useRemoveDependency(boardId, taskId);
  const { titleOf } = useTaskLookup(boardId, taskId);
  const [picker, setPicker] = useState<DependencyDirection | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DependencyVariables | null>(null);

  const predecessors = dependencies.data?.predecessors;
  const successors = dependencies.data?.successors;

  /** Loại thẻ hiện tại và mọi thẻ đã nối (cả hai hướng: nối ngược lại luôn thành vòng `TASK_005`). */
  const linkedIds = new Set([
    taskId,
    ...(predecessors ?? []).map((item) => item.id),
    ...(successors ?? []).map((item) => item.id),
  ]);

  const closePicker = () => setPicker(null);

  return {
    adding: add.isPending,
    dependencies,
    linkedIds,
    picker,
    pickerError,
    removePending: remove.isPending,
    removing,
    cancelRemove: () => setRemoving(null),
    closePicker,
    confirmRemove: () => {
      if (!removing) return;
      remove.mutate(removing, {
        onError: (error) => showToast('error', criticalPathErrorMessage(error, titleOf)),
        onSettled: () => setRemoving(null),
      });
    },
    openPicker: (direction: DependencyDirection) => {
      setPickerError(null);
      setPicker(direction);
    },
    pick: (other: DependencyTaskDto) => {
      if (!picker) return;
      add.mutate(
        { direction: picker, other },
        {
          onError: (error) => setPickerError(criticalPathErrorMessage(error, titleOf)),
          onSuccess: closePicker,
        },
      );
    },
    askRemove: (direction: DependencyDirection, other: DependencyTaskDto) =>
      setRemoving({ direction, other }),
  };
}
