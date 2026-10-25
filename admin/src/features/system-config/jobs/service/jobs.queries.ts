import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { FailedJobsParams, OutboxParams, QueueName } from '../types/jobs.types';
import { isStaleJobError } from '../utils/job-errors';
import { jobsService } from './jobs.service';

/** Chu kỳ tự làm mới của sub-tab "Hàng đợi" (admin.md p0-04 §2.1). */
export const QUEUES_REFETCH_MS = 15_000;

export const jobsKeys = {
  all: ['system-config', 'jobs'] as const,
  queues: ['system-config', 'jobs', 'queues'] as const,
  failedAll: ['system-config', 'jobs', 'failed'] as const,
  failed: (p: FailedJobsParams) => ['system-config', 'jobs', 'failed', p] as const,
  outboxAll: ['system-config', 'jobs', 'outbox'] as const,
  outbox: (p: OutboxParams) => ['system-config', 'jobs', 'outbox', p] as const,
};

/** Tổng quan hàng đợi — polling 15 s (React Query tự dừng khi tab trình duyệt ẩn). */
export const useQueuesOverview = () =>
  useQuery({
    queryKey: jobsKeys.queues,
    queryFn: () => jobsService.queues(),
    refetchInterval: QUEUES_REFETCH_MS,
    select: (res) => res.data,
  });

export const useFailedJobs = (params: FailedJobsParams) =>
  useQuery({
    queryKey: jobsKeys.failed(params),
    queryFn: () => jobsService.failed(params),
    // Đổi trang/lọc: giữ trang cũ trên màn tới khi trang mới về — bảng không nháy rỗng.
    placeholderData: keepPreviousData,
    select: (res) => res.data,
  });

/** Outbox phân trang cursor — `fetchNextPage` là nút "Tải thêm". */
export const useOutbox = (params: OutboxParams) =>
  useInfiniteQuery({
    queryKey: jobsKeys.outbox(params),
    queryFn: ({ pageParam }) => jobsService.outbox(params, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
  });

/**
 * Sau khi ghi: làm mới đúng phần dữ liệu bị ảnh hưởng + nhật ký audit (bản ghi
 * `system.job-*` mới xuất hiện ở `AuditTrailPanel`/trang nhật ký).
 */
function useRefreshAfterWrite() {
  const qc = useQueryClient();
  return (keys: readonly (readonly string[])[]) => {
    keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
    void qc.invalidateQueries({ queryKey: ['audit-log'] });
  };
}

interface JobTarget {
  queue: QueueName;
  jobId: string;
  reason: string;
}

/**
 * `onError`: `JOB_001..003` = màn đang hiện dữ liệu cũ ⇒ làm mới để dòng cũ biến
 * mất/đổi trạng thái. Toast lỗi do interceptor lo (thông điệp BE tiếng Việt).
 */
export const useRetryJob = () => {
  const refresh = useRefreshAfterWrite();
  const keys = [jobsKeys.failedAll, jobsKeys.queues];
  return useMutation({
    mutationFn: ({ queue, jobId, reason }: JobTarget) =>
      jobsService.retry(queue, jobId, { reason }),
    onSuccess: () => {
      refresh(keys);
      showToast('success', 'Đã chạy lại job và ghi nhật ký');
    },
    onError: (err) => isStaleJobError(err) && refresh(keys),
  });
};

export const useRemoveJob = () => {
  const refresh = useRefreshAfterWrite();
  const keys = [jobsKeys.failedAll, jobsKeys.queues];
  return useMutation({
    mutationFn: ({ queue, jobId, reason }: JobTarget) =>
      jobsService.remove(queue, jobId, { reason }),
    onSuccess: () => {
      refresh(keys);
      showToast('success', 'Đã gỡ job và ghi nhật ký');
    },
    onError: (err) => isStaleJobError(err) && refresh(keys),
  });
};

export const useRequeueOutbox = () => {
  const refresh = useRefreshAfterWrite();
  const keys = [jobsKeys.outboxAll];
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      jobsService.requeueOutbox(id, { reason }),
    onSuccess: () => {
      refresh(keys);
      showToast('success', 'Đã đưa sự kiện về hàng đợi và ghi nhật ký');
    },
    onError: (err) => isStaleJobError(err) && refresh(keys),
  });
};
