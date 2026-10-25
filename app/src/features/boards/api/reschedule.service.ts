import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  rescheduleBatchPath,
  taskReschedulePath,
  taskReschedulePreviewPath,
} from './critical-path.api';
import type {
  RescheduleAppliedItem,
  RescheduleApplyPayload,
  RescheduleApplyResult,
  RescheduleBatchDto,
  RescheduleChange,
  ReschedulePreviewDto,
  RescheduleSkipped,
} from './critical-path.types';

/** Thân `200`/`202` của `POST /reschedule` — hai hình dạng, phân biệt bằng mã HTTP. */
interface ApplyBody {
  affectedCount?: number;
  applied?: RescheduleAppliedItem[];
  batchId?: string;
  rescheduleId?: string;
  skipped?: RescheduleSkipped[];
}

/**
 * `POST /tasks/:id/reschedule-preview`, `POST /tasks/:id/reschedule`, `GET /reschedule-batches/:id` (be.md §4).
 *
 * `skipErrorToast`: `TASK_019` (kế hoạch cũ → preview mới), `TASK_020` (bảng đang có lô khác), `RES_003` là luồng
 * chuẩn của tấm cảnh báo, mỗi mã một cách xử lý riêng — toast mặc định chỉ làm người dùng đọc hai câu cho một sự cố.
 */
export const rescheduleService = {
  /** Chỉ đọc — không khoá, không ghi. Kéo thanh Gantt và `TASK_006` đều dựa vào kết quả này. */
  async preview(taskId: string, change: RescheduleChange): Promise<ReschedulePreviewDto> {
    const response = await apiClient.post<ReschedulePreviewDto>(
      taskReschedulePreviewPath(taskId),
      change,
      { skipErrorToast: true },
    );
    return unwrapData<ReschedulePreviewDto>(response);
  },

  /**
   * `200` = đã áp đồng bộ, `202` = xếp lô nền (`batchId`). Phân biệt bằng MÃ HTTP chứ không đoán theo hình dạng thân —
   * BE có thể thêm trường vào một trong hai mà không báo.
   */
  async apply(taskId: string, payload: RescheduleApplyPayload): Promise<RescheduleApplyResult> {
    const response = await apiClient.post<ApplyBody>(taskReschedulePath(taskId), payload, {
      skipErrorToast: true,
    });
    const body = unwrapData<ApplyBody>(response);
    if (response.status === 202) {
      return { affectedCount: body.affectedCount ?? 0, batchId: body.batchId ?? '', kind: 'queued' };
    }
    return {
      applied: body.applied ?? [],
      kind: 'applied',
      rescheduleId: body.rescheduleId ?? '',
      skipped: body.skipped ?? [],
    };
  },

  async batch(batchId: string): Promise<RescheduleBatchDto> {
    const response = await apiClient.get<RescheduleBatchDto>(rescheduleBatchPath(batchId), {
      skipErrorToast: true,
    });
    return unwrapData<RescheduleBatchDto>(response);
  },
};
