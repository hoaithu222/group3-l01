import { LIMITS } from "../../../core/constants/limits";
import { enqueue, scheduleAt, toSafeJobId, type OutboxEventInput } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import type { CalendarSyncJob, IIntegrationJobs } from "./integration.ports";

/** Tên queue/job của module tích hợp (queue `integrations` đã có ở p0-04; cron ở queue `cron`). */
export const INTEGRATIONS_QUEUE = "integrations" as const;
export const WEBHOOK_PROCESS_JOB = "integrations.webhook-process";
export const TOKEN_REFRESH_JOB = "integration.token-refresh";
export const CALENDAR_SYNC_JOB = "calendar.sync-meeting";
export const TARGET_RECHECK_JOB = "integrations.target-recheck";
export const CALENDAR_CLEANUP_JOB = "calendar.cleanup-user";

/** Trần chờ Redis cho việc xếp job trên đường phản hồi request (`queueConnection` không tự reject khi Redis mất). */
const ENQUEUE_TIMEOUT_MS = 1500;

export interface TokenRefreshJobData {
  kind: "WORKSPACE" | "USER";
  id: string;
  /** `tokenExpiresAt` (epoch ms) lúc hẹn — processor bỏ qua nếu token đã được làm mới sang mốc khác (job cũ). */
  expiresAtMs: number;
}

export interface WebhookProcessJobData {
  webhookEventId: string;
}

/** jobId có ≥ 3 dấu `:` ⇒ BẮT BUỘC qua `toSafeJobId` (BullMQ từ chối) — cả lúc tạo lẫn tra cứu. */
export function tokenRefreshJobId(id: string, expiresAtMs: number): string {
  return toSafeJobId(`int-refresh:${id}:${expiresAtMs}`);
}

export function webhookProcessDedupeKey(provider: string, eventId: string): string {
  return `wh:${provider.toLowerCase()}:${eventId}`;
}

export function calendarSyncJobId(job: CalendarSyncJob): string {
  return toSafeJobId(`calendar.sync-meeting:meeting:${job.meetingId}:user:${job.userId}:v${job.version}`);
}

/** Dòng outbox hẹn làm mới token — ghi cùng transaction với lưu token (bền qua restart), relay chạy đúng `availableAt`. */
export function tokenRefreshOutbox(kind: "WORKSPACE" | "USER", id: string, expiresAt: Date): OutboxEventInput {
  const expiresAtMs = expiresAt.getTime();
  return {
    type: "integration.token-refresh.schedule",
    aggregateType: kind === "USER" ? "UserIntegration" : "Integration",
    aggregateId: id,
    queue: INTEGRATIONS_QUEUE,
    jobName: TOKEN_REFRESH_JOB,
    payload: { kind, id, expiresAtMs } satisfies TokenRefreshJobData,
    dedupeKey: `int-refresh:${id}:${expiresAtMs}`,
    availableAt: new Date(expiresAtMs - LIMITS.integration.tokenRefreshLeadSeconds * 1000),
  };
}

/** Dòng outbox xử lý webhook (`integrations.webhook-process`, jobId = dedupeKey `wh:{provider}:{eventId}`). */
export function webhookProcessOutbox(provider: string, eventId: string, webhookEventId: string): OutboxEventInput {
  return {
    type: "integration.webhook.received",
    aggregateType: "WebhookEvent",
    aggregateId: webhookEventId,
    queue: INTEGRATIONS_QUEUE,
    jobName: WEBHOOK_PROCESS_JOB,
    payload: { webhookEventId } satisfies WebhookProcessJobData,
    dedupeKey: webhookProcessDedupeKey(provider, eventId),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Quá ${ms} ms khi thao tác hàng đợi`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Cài đặt BullMQ của `IIntegrationJobs` — mọi lệnh bọc timeout và KHÔNG ném (Redis lỗi chỉ log; cron/outbox bù). */
export class BullIntegrationJobs implements IIntegrationJobs {
  async scheduleTokenRefresh(kind: "WORKSPACE" | "USER", id: string, expiresAt: Date): Promise<void> {
    const expiresAtMs = expiresAt.getTime();
    const runAt = new Date(expiresAtMs - LIMITS.integration.tokenRefreshLeadSeconds * 1000);
    try {
      await withTimeout(
        scheduleAt(INTEGRATIONS_QUEUE, TOKEN_REFRESH_JOB, tokenRefreshJobId(id, expiresAtMs), { kind, id, expiresAtMs } satisfies TokenRefreshJobData, runAt),
        ENQUEUE_TIMEOUT_MS
      );
    } catch (err) {
      logger.warn("[integrations] Không hẹn được job làm mới token — sẽ làm mới khi dùng", { id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async enqueueCalendarSync(job: CalendarSyncJob): Promise<void> {
    await withTimeout(enqueue(INTEGRATIONS_QUEUE, CALENDAR_SYNC_JOB, job, { jobId: calendarSyncJobId(job), attempts: 5, backoff: { type: "exponential", delay: 2000 } }), ENQUEUE_TIMEOUT_MS);
  }

  async enqueueCalendarCleanup(userIntegrationId: string): Promise<void> {
    await withTimeout(enqueue(INTEGRATIONS_QUEUE, CALENDAR_CLEANUP_JOB, { userIntegrationId }, { jobId: toSafeJobId(`calendar.cleanup-user:${userIntegrationId}`), attempts: 5, backoff: { type: "exponential", delay: 2000 } }), ENQUEUE_TIMEOUT_MS);
  }

  async enqueueTargetRecheck(input: { scopeType: string; scopeId: string; userIds: string[] }): Promise<void> {
    const key = `${input.scopeType}:${input.scopeId}:${Date.now()}`;
    await withTimeout(enqueue(INTEGRATIONS_QUEUE, TARGET_RECHECK_JOB, input, { jobId: toSafeJobId(`int-recheck:${key}`) }), ENQUEUE_TIMEOUT_MS);
  }
}
