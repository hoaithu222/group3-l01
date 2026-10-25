import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { TaskCardDto } from './boards.types';
import {
  taskChecklistConvertPath,
  taskDuplicatePath,
  taskWatchPath,
  taskWatchersPath,
} from './task-detail.api';
import type {
  ConvertChecklistResult,
  DuplicateTaskPayload,
  TaskWatchers,
  TaskWatchStatus,
} from './task-detail.types';

/**
 * Theo dõi thẻ · sao chép thẻ · chuyển mục checklist thành thẻ (p3-03 P1). Mọi lời gọi `skipErrorToast`: lỗi hiện đúng chỗ người dùng
 * đang nhìn (tấm sao chép, dòng theo dõi, menu việc nhỏ) hoặc do hook toast MỘT lần — không để interceptor toast thêm lần hai.
 */
export const taskExtrasService = {
  /** Idempotent. Cần quyền đọc bảng; dùng được cả trên bảng đã lưu trữ (theo dõi là sở thích cá nhân). */
  async watch(taskId: string): Promise<TaskWatchStatus> {
    const response = await apiClient.put<TaskWatchStatus>(taskWatchPath(taskId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<TaskWatchStatus>(response);
  },

  /** Idempotent. Tắt cả khi là người làm/người tạo — chỉ ảnh hưởng thông báo bình luận/nhắc hạn. */
  async unwatch(taskId: string): Promise<TaskWatchStatus> {
    const response = await apiClient.delete<TaskWatchStatus>(taskWatchPath(taskId), {
      skipErrorToast: true,
    });
    return unwrapData<TaskWatchStatus>(response);
  },

  async watchers(taskId: string): Promise<TaskWatchers> {
    const response = await apiClient.get<TaskWatchers>(taskWatchersPath(taskId), {
      skipErrorToast: true,
    });
    const data = unwrapData<TaskWatchers>(response);
    return { me: data.me, total: data.total ?? data.watchers?.length ?? 0, watchers: data.watchers ?? [] };
  },

  /**
   * `201` = thẻ mới, `200` = phát lại cùng `clientTaskId` (trả thẻ đã tạo) — cả hai cùng thân `TaskCardDto`.
   * `Idempotency-Key` cùng giá trị với `clientTaskId`: BE phát lại nguyên phản hồi cũ khi thử lại sau mất mạng.
   */
  async duplicate(
    taskId: string,
    payload: DuplicateTaskPayload,
    idempotencyKey: string,
  ): Promise<TaskCardDto> {
    const response = await apiClient.post<TaskCardDto>(taskDuplicatePath(taskId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<TaskCardDto>(response);
  },

  /**
   * Thân rỗng: mặc định thẻ mới vào cột TODO đầu tiên. Gọi lại sau khi đã chuyển → `200 created:false` (BE khoá tất định theo mục,
   * không cần `Idempotency-Key`). Lỗi: `404` (mục không còn), `TASK_010` (bảng đủ thẻ), `TASK_001`, `TASK_002`.
   */
  async convertChecklistItem(taskId: string, itemId: string): Promise<ConvertChecklistResult> {
    const response = await apiClient.post<ConvertChecklistResult>(
      taskChecklistConvertPath(taskId, itemId),
      {},
      { skipErrorToast: true },
    );
    return unwrapData<ConvertChecklistResult>(response);
  },
};
