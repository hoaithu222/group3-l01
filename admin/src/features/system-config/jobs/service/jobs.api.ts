import type { QueueName } from '../types/jobs.types';

/**
 * Đường dẫn endpoint `/admin/jobs` — khớp `admin-jobs.routes.ts` phía BE.
 *
 * `jobId` có thể chứa `:` (jobId = `dedupeKey`, vd `mail.send:welcome:ab12`) nên
 * PHẢI `encodeURIComponent` khi ghép vào đường dẫn.
 */
export const jobsApi = {
  /** GET — mọi queue: số đếm + lịch định kỳ. */
  QUEUES: '/admin/jobs/queues',
  /** GET `?queue&start&limit` — job lỗi (payload đã che). */
  FAILED: '/admin/jobs/failed',
  /** POST `{ reason }` — chạy lại 1 job đang lỗi. */
  RETRY: (queue: QueueName, jobId: string) =>
    `/admin/jobs/${queue}/${encodeURIComponent(jobId)}/retry`,
  /** POST `{ reason }` — gỡ 1 job khỏi hàng đợi (POST thay DELETE để mang body). */
  REMOVE: (queue: QueueName, jobId: string) =>
    `/admin/jobs/${queue}/${encodeURIComponent(jobId)}/remove`,
  /** GET `?status&type&cursor&limit` — outbox, cursor pagination. */
  OUTBOX: '/admin/jobs/outbox',
  /** POST `{ reason }` — đưa bản ghi FAILED về PENDING. */
  OUTBOX_REQUEUE: (id: string) => `/admin/jobs/outbox/${encodeURIComponent(id)}/requeue`,
} as const;
