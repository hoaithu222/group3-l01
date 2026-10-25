import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DependencyTaskDto, TaskDependenciesDto } from '../api/critical-path.types';
import { dependenciesService } from '../api/dependencies.service';
import type { TaskDetailDto } from '../api/task-detail.types';
import { DEPENDENCY_STALE_MS } from '../constants/critical-path.constants';
import { applyDependencyDelta } from '../utils/dependency-cache';
import { boardKeys } from './boards.keys';
import { taskKeys } from './task-detail.keys';

/**
 * Phụ thuộc của một thẻ (app.md §4): `TaskDetailDto.dependencies` (khi BE trả) làm `initialData` — kèm
 * `initialDataUpdatedAt` của CHÍNH query chi tiết, để `staleTime` 30 s tính từ lúc chi tiết được tải chứ không từ
 * lúc màn mở (không thì dữ liệu cũ hàng phút bị coi là "tươi").
 */
export function useTaskDependencies(taskId: string, enabled = true) {
  const queryClient = useQueryClient();

  return useQuery({
    enabled: enabled && Boolean(taskId),
    initialData: () => queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId))?.dependencies,
    initialDataUpdatedAt: () => queryClient.getQueryState(taskKeys.detail(taskId))?.dataUpdatedAt,
    queryFn: () => dependenciesService.list(taskId),
    queryKey: taskKeys.dependencies(taskId),
    staleTime: DEPENDENCY_STALE_MS,
  });
}

/** Hướng của thẻ ĐỐI DIỆN so với thẻ đang mở: `predecessor` = thẻ đang chặn thẻ này, `successor` = thẻ bị thẻ này chặn. */
export type DependencyDirection = 'predecessor' | 'successor';

export interface DependencyVariables {
  direction: DependencyDirection;
  other: DependencyTaskDto;
}

/** `[thẻ sau, thẻ trước]` theo hướng — `POST`/`DELETE` luôn gọi trên THẺ SAU. */
function ends(taskId: string, { direction, other }: DependencyVariables): [string, string] {
  return direction === 'predecessor' ? [taskId, other.id] : [other.id, taskId];
}

/**
 * Thêm/gỡ phụ thuộc — KHÔNG optimistic (app.md §4): vòng chỉ server kiểm được (`TASK_005`), hiện cạnh rồi rút lại
 * gây nháy khó chịu hơn chờ một nhịp. Thành công → cập nhật danh sách của thẻ đang mở, bộ đếm hai thẻ (chip Kanban),
 * và tải lại phần phía thẻ đối diện + `version` chi tiết (BE tăng `version` cả hai thẻ khi đổi cạnh).
 */
function useDependencyMutation(boardId: string, taskId: string, kind: 'add' | 'remove') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: DependencyVariables) => {
      const [successorId, predecessorId] = ends(taskId, variables);
      if (kind === 'remove') {
        await dependenciesService.remove(successorId, predecessorId);
        return { created: true };
      }
      return dependenciesService.add(successorId, predecessorId);
    },

    onSuccess: ({ created }, variables) => {
      const { direction, other } = variables;
      const mine = queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId));
      const listKey = taskKeys.dependencies(taskId);

      queryClient.setQueryData<TaskDependenciesDto>(listKey, (current) => {
        if (!current) return current;
        const group = direction === 'predecessor' ? 'predecessors' : 'successors';
        const rest = current[group].filter((item) => item.id !== other.id);
        return { ...current, [group]: kind === 'add' ? [...rest, other] : rest };
      });

      if (created && mine) {
        const mineEnd = { columnKind: mine.columnKind, id: taskId };
        const otherEnd = { columnKind: other.columnKind, id: other.id };
        applyDependencyDelta(
          queryClient,
          boardId,
          direction === 'predecessor'
            ? { predecessor: otherEnd, successor: mineEnd }
            : { predecessor: mineEnd, successor: otherEnd },
          kind === 'add' ? 1 : -1,
        );
      }

      // Danh sách CHUẨN (ngày bắt đầu, người làm của thẻ vừa nối) + phía thẻ đối diện + `version` mới của chi tiết.
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: taskKeys.dependencies(other.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
    },
  });
}

export function useAddDependency(boardId: string, taskId: string) {
  return useDependencyMutation(boardId, taskId, 'add');
}

export function useRemoveDependency(boardId: string, taskId: string) {
  return useDependencyMutation(boardId, taskId, 'remove');
}
