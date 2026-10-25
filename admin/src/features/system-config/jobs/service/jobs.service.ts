import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  FailedJobsPage,
  FailedJobsParams,
  JobActionPayload,
  OutboxPage,
  OutboxParams,
  QueueName,
  QueueSummary,
} from '../types/jobs.types';
import { jobsApi } from './jobs.api';

/**
 * Service THUẦN cho `/admin/jobs`. Lỗi `JOB_001..003` do interceptor toast sẵn
 * (BE trả thông điệp tiếng Việt) — service KHÔNG tắt toast; hook/component chỉ
 * xử lý phần "làm mới danh sách" (xem `utils/job-errors.ts`).
 */
export const jobsService = {
  queues: async (): Promise<ApiResponse<QueueSummary[]>> =>
    (await apiClient.get<ApiResponse<QueueSummary[]>>(jobsApi.QUEUES)).data,

  failed: async (params: FailedJobsParams): Promise<ApiResponse<FailedJobsPage>> =>
    (await apiClient.get<ApiResponse<FailedJobsPage>>(jobsApi.FAILED, { params })).data,

  retry: async (
    queue: QueueName,
    jobId: string,
    payload: JobActionPayload,
  ): Promise<ApiResponse<{ retried: true }>> =>
    (await apiClient.post<ApiResponse<{ retried: true }>>(jobsApi.RETRY(queue, jobId), payload))
      .data,

  remove: async (
    queue: QueueName,
    jobId: string,
    payload: JobActionPayload,
  ): Promise<ApiResponse<{ removed: true }>> =>
    (await apiClient.post<ApiResponse<{ removed: true }>>(jobsApi.REMOVE(queue, jobId), payload))
      .data,

  /** `cursor` bỏ trống = trang đầu. `limit` để BE dùng mặc định. */
  outbox: async (params: OutboxParams, cursor?: string): Promise<OutboxPage> =>
    (await apiClient.get<OutboxPage>(jobsApi.OUTBOX, { params: { ...params, cursor } })).data,

  requeueOutbox: async (
    id: string,
    payload: JobActionPayload,
  ): Promise<ApiResponse<{ status: 'PENDING' }>> =>
    (await apiClient.post<ApiResponse<{ status: 'PENDING' }>>(jobsApi.OUTBOX_REQUEUE(id), payload))
      .data,
};
