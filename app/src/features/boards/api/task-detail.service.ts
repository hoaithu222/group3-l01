import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { TaskCardDto } from './boards.types';
import { taskPath, taskRestorePath } from './task-detail.api';
import type { TaskDetailDto, TaskPatchPayload } from './task-detail.types';
import { decodeTaskDetail } from '../utils/html-entities';

/**
 * `GET/PATCH/DELETE /tasks/:id` + `POST /tasks/:id/restore` (be.md §4).
 *
 * `skipErrorToast` ở thao tác đọc/sửa: màn chi tiết tự chọn câu báo theo mã lỗi (409 `RES_003`
 * khác lỗi mạng khác `TASK_013`) và giữ giá trị người dùng đang nhập trong sheet.
 */
export const taskDetailService = {
  /**
   * `includeDeleted=true` LUÔN gửi: BE chỉ trả thẻ đã xoá cho người có quyền khôi phục, người
   * khác vẫn nhận 404 — nên mở từ link/thông báo một thẻ vừa bị xoá ra banner "Khôi phục" đúng người.
   */
  async get(taskId: string): Promise<TaskDetailDto> {
    const response = await apiClient.get<TaskDetailDto>(taskPath(taskId), {
      params: { includeDeleted: true },
      skipErrorToast: true,
    });
    return decodeTaskDetail(unwrapData<TaskDetailDto>(response));
  },

  async patch(taskId: string, payload: TaskPatchPayload): Promise<TaskDetailDto> {
    const response = await apiClient.patch<TaskDetailDto>(taskPath(taskId), payload, {
      skipErrorToast: true,
    });
    return decodeTaskDetail(unwrapData<TaskDetailDto>(response));
  },

  async remove(taskId: string): Promise<void> {
    await apiClient.delete(taskPath(taskId));
  },

  /** `TASK_016` (410) hiện bằng toast tự động: "Thẻ đã xoá quá lâu, không thể khôi phục". */
  async restore(taskId: string): Promise<TaskCardDto> {
    const response = await apiClient.post<TaskCardDto>(taskRestorePath(taskId));
    return unwrapData<TaskCardDto>(response);
  },
};
