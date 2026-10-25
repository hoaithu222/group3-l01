import type { OutboxEvent } from "@prisma/client";
import { getQueue, QUEUE_NAMES, outboxSignal, type QueueName } from "../../infrastructure/queue";
import { prisma } from "../../infrastructure/database";
import { JobNotFoundError, JobNotRetryableError, OutboxEventNotFailedError } from "../../core/exceptions";
import { encodeCursor, decodeCursor } from "../../core/utils/cursor";
import type { CursorResponse } from "../../core/utils/response";
import { maskPayload } from "./mask-payload";
import type { OutboxQuery } from "./admin-jobs.validators";

/** Cổng ghi audit log — thoả mãn bởi `AuditService` (module audit-log) qua structural typing. */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface AdminQueueScheduler {
  id: string;
  pattern: string | null;
  next: number | null;
}

export interface AdminQueueSummary {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
  schedulers: AdminQueueScheduler[];
}

export interface AdminFailedJob {
  queue: QueueName;
  jobId: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | null;
  dataPreview: unknown;
}

export interface AdminOutboxEventDto {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  queue: string;
  jobName: string;
  status: string;
  attempts: number;
  lastError: string | null;
  availableAt: Date;
  createdAt: Date;
  dispatchedAt: Date | null;
  payloadPreview: unknown;
}

/**
 * `AdminJobsService` — quan sát/quản trị hàng đợi BullMQ + `OutboxEvent`
 * (be.md §3/§4). Đọc thẳng BullMQ `Queue` (không qua repository — hàng đợi
 * không phải domain model có CRUD, xem `architecture.md` "Pattern Flat").
 */
export class AdminJobsService {
  constructor(private readonly audit?: AuditRecorder) {}

  async getQueues(): Promise<AdminQueueSummary[]> {
    return Promise.all(
      QUEUE_NAMES.map(async (name): Promise<AdminQueueSummary> => {
        const queue = getQueue(name);
        const [counts, paused, schedulers] = await Promise.all([
          queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
          queue.isPaused(),
          queue.getJobSchedulers(),
        ]);
        return {
          name,
          waiting: counts["waiting"] ?? 0,
          active: counts["active"] ?? 0,
          delayed: counts["delayed"] ?? 0,
          failed: counts["failed"] ?? 0,
          completed: counts["completed"] ?? 0,
          paused,
          schedulers: schedulers.map((s) => ({
            id: s.key ?? "",
            // Lịch theo chu kỳ (`everyMs`, vd relay outbox 10 s) không có cron pattern — hiện "every 10000ms" thay vì để trống.
            pattern: s.pattern ?? (typeof s.every === "number" ? `every ${s.every}ms` : null),
            next: s.next ?? null,
          })),
        };
      })
    );
  }

  /**
   * Danh sách job lỗi — `queue` bỏ trống thì gộp tất cả queue. BullMQ không
   * có chỉ mục toàn cục xuyên nhiều queue nên với trường hợp gộp, lấy tối đa
   * `limit` job lỗi mới nhất TỪ MỖI queue rồi sắp lại theo `timestamp`, cắt
   * còn `limit` — đơn giản hoá có chủ đích cho công cụ quan sát nội bộ, không
   * phải phân trang chính xác tuyệt đối xuyên nhiều queue.
   */
  async getFailedJobs(
    queue: QueueName | undefined,
    start: number,
    limit: number
  ): Promise<{ items: AdminFailedJob[]; total: number }> {
    const queues = queue ? [queue] : QUEUE_NAMES;

    const perQueue = await Promise.all(
      queues.map(async (name) => {
        const q = getQueue(name);
        const [jobs, total] = await Promise.all([
          q.getJobs(["failed"], start, start + limit - 1, false),
          q.getFailedCount(),
        ]);
        return { name, jobs, total };
      })
    );

    const items: AdminFailedJob[] = perQueue
      .flatMap(({ name, jobs }) =>
        jobs.map(
          (job): AdminFailedJob => ({
            queue: name,
            jobId: String(job.id),
            name: job.name,
            failedReason: job.failedReason ?? null,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            finishedOn: job.finishedOn ?? null,
            dataPreview: maskPayload(job.data),
          })
        )
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    const total = perQueue.reduce((sum, q) => sum + q.total, 0);
    return { items, total };
  }

  async retryJob(
    queue: QueueName,
    jobId: string,
    reason: string,
    actorId: string,
    actorRole?: string
  ): Promise<void> {
    const job = await getQueue(queue).getJob(jobId);
    if (!job) throw new JobNotFoundError();
    if (!(await job.isFailed())) throw new JobNotRetryableError();

    await job.retry();
    await this.audit?.record({
      actorId,
      actorRole,
      action: "system.job-retry",
      targetType: "QueueJob",
      targetId: `${queue}:${jobId}`,
      reason,
      metadata: { queue, jobId },
    });
  }

  async removeJob(
    queue: QueueName,
    jobId: string,
    reason: string,
    actorId: string,
    actorRole?: string
  ): Promise<void> {
    const job = await getQueue(queue).getJob(jobId);
    if (!job) throw new JobNotFoundError();

    await job.remove();
    await this.audit?.record({
      actorId,
      actorRole,
      action: "system.job-remove",
      targetType: "QueueJob",
      targetId: `${queue}:${jobId}`,
      reason,
      metadata: { queue, jobId },
    });
  }

  async listOutbox(query: OutboxQuery): Promise<CursorResponse<AdminOutboxEventDto>> {
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;

    const records = await prisma.outboxEvent.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.type && { type: query.type }),
        ...(decoded && {
          OR: [
            { createdAt: { lt: decoded.at } },
            { createdAt: decoded.at, id: { lt: decoded.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });

    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;
    const last = page[page.length - 1];

    return {
      data: page.map((e) => this.toOutboxDto(e)),
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
        hasMore,
        limit: query.limit,
      },
    };
  }

  /**
   * Chạy lại 1 `OutboxEvent` đã `FAILED` — đặt lại `PENDING`/`attempts: 0` để
   * relay coi như lần thử mới hoàn toàn (không hết hạn ngay do `attempts` cũ
   * đã chạm `LIMITS.outbox.maxAttempts`), rồi báo `outboxSignal()` để relay xử
   * lý ngay thay vì chờ poll.
   */
  async requeueOutbox(id: string, reason: string, actorId: string, actorRole?: string): Promise<void> {
    const event = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!event || event.status !== "FAILED") throw new OutboxEventNotFailedError();

    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "PENDING", availableAt: new Date(), attempts: 0, lastError: null },
    });
    await outboxSignal();

    await this.audit?.record({
      actorId,
      actorRole,
      action: "system.job-outbox-requeue",
      targetType: "OutboxEvent",
      targetId: id,
      reason,
      metadata: { type: event.type, queue: event.queue, jobName: event.jobName },
    });
  }

  private toOutboxDto(e: OutboxEvent): AdminOutboxEventDto {
    return {
      id: e.id,
      type: e.type,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      queue: e.queue,
      jobName: e.jobName,
      status: e.status,
      attempts: e.attempts,
      lastError: e.lastError,
      availableAt: e.availableAt,
      createdAt: e.createdAt,
      dispatchedAt: e.dispatchedAt,
      payloadPreview: maskPayload(e.payload),
    };
  }
}
