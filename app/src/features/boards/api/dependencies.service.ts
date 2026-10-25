import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { taskDependenciesPath, taskDependencyPath } from './critical-path.api';
import type { DependencyDto, TaskDependenciesDto } from './critical-path.types';

/**
 * `GET|POST /tasks/:id/dependencies`, `DELETE /tasks/:id/dependencies/:predecessorId` (be.md §4).
 *
 * `skipErrorToast` ở mọi thao tác GHI: `TASK_005` (vòng) / `TASK_017` / `TASK_018` / `TASK_021` là một phần của luồng
 * chọn thẻ — màn tự dịch mã thành câu (kèm tiêu đề thẻ trong vòng) và hiện NGAY trong tấm chọn, không phải toast.
 */
export const dependenciesService = {
  async list(taskId: string): Promise<TaskDependenciesDto> {
    const response = await apiClient.get<TaskDependenciesDto>(taskDependenciesPath(taskId), {
      skipErrorToast: true,
    });
    const data = unwrapData<TaskDependenciesDto>(response);
    // Phòng BE trả thiếu một nhóm (thẻ chưa có cạnh nào) — màn luôn đọc được hai mảng.
    return { predecessors: data.predecessors ?? [], successors: data.successors ?? [] };
  },

  /**
   * `successorId` = thẻ BỊ CHẶN (`:id`); `predecessorId` = thẻ phải xong trước (thân). `201` = vừa tạo, `200` = cạnh
   * đã có (bản cũ) — `created` để nơi gọi khỏi cộng bộ đếm lần hai.
   */
  async add(
    successorId: string,
    predecessorId: string,
  ): Promise<{ created: boolean; dependency: DependencyDto }> {
    const response = await apiClient.post<DependencyDto>(
      taskDependenciesPath(successorId),
      { predecessorId },
      { skipErrorToast: true },
    );
    return { created: response.status === 201, dependency: unwrapData<DependencyDto>(response) };
  },

  /** Không có cạnh vẫn `204` — gỡ hai lần vô hại. */
  async remove(successorId: string, predecessorId: string): Promise<void> {
    await apiClient.delete(taskDependencyPath(successorId, predecessorId), { skipErrorToast: true });
  },
};
