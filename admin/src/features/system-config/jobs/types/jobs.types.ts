/**
 * Kiểu dữ liệu `/admin/jobs/*` — khớp `AdminJobsService`
 * (`be/src/modules/admin-jobs/admin-jobs.service.ts`).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi
 * p0-09 xong.
 *
 * ⚠️ Mọi `payloadPreview`/`dataPreview` đã bị BE che (`maskPayload`) — client
 * KHÔNG có cách "giải che" và cũng không được thử.
 */

import type { CursorMeta } from '@/shared/types/api.types';

/** Khớp `QUEUE_NAMES` phía BE (`infrastructure/queue/queues.ts`). */
export const QUEUE_NAMES = [
  'notifications',
  'push',
  'media',
  'reports',
  'gamification',
  'integrations',
  'cron',
  'calls',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Lịch chạy định kỳ của 1 queue. BE chỉ trả `pattern` (cron); scheduler kiểu
 * `every` có `pattern: null`. `next` là epoch ms.
 */
export interface QueueScheduler {
  id: string;
  pattern: string | null;
  next: number | null;
}

export interface QueueSummary {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
  schedulers: QueueScheduler[];
}

export interface FailedJob {
  queue: QueueName;
  jobId: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  /** Epoch ms lúc job được tạo. */
  timestamp: number;
  /** Epoch ms lúc job kết thúc (lỗi). */
  finishedOn: number | null;
  /** Payload ĐÃ CHE. Quá 2 KiB thì là `{ truncated: true, preview: string }`. */
  dataPreview: unknown;
}

export interface FailedJobsPage {
  items: FailedJob[];
  total: number;
}

export interface FailedJobsParams {
  queue?: QueueName;
  start: number;
  limit: number;
}

export type OutboxStatus = 'PENDING' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED';

export interface OutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  queue: string;
  jobName: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  availableAt: string;
  createdAt: string;
  dispatchedAt: string | null;
  /** Payload ĐÃ CHE. */
  payloadPreview: unknown;
}

/** `ResponseUtils.cursor` — danh sách ở `data`, con trỏ ở `meta`. */
export interface OutboxPage {
  data: OutboxEvent[];
  meta: CursorMeta;
}

export interface OutboxParams {
  status?: OutboxStatus;
  type?: string;
}

/** Body chung của retry / remove / requeue — BE bắt buộc `reason` 10–500 ký tự. */
export interface JobActionPayload {
  reason: string;
}

export type FailedJobAction = 'retry' | 'remove';
