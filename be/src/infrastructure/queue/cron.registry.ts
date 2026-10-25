import type { JobSchedulerTemplateOptions } from "bullmq";
import { getQueue, type QueueName } from "./queues";
import { env } from "../../core/config";
import { logger } from "../logger";

export interface CronDefinition {
  /** Định danh duy nhất của scheduler — cũng là `jobId` của mỗi job nó sinh ra (idempotent). */
  schedulerId: string;
  queue: QueueName;
  jobName: string;
  /** Cron pattern chuẩn (5 trường), diễn giải theo `tz`. Bắt buộc TRỪ khi dùng `everyMs`. */
  pattern?: string;
  /**
   * Chu kỳ lặp theo mili giây (BullMQ `every`) cho lịch DƯỚI 1 phút mà cron 5 trường không biểu diễn được (vd relay outbox 10 s, p0-04 be.md §5.3).
   * Loại trừ với `pattern`/`tz`. Mỗi lần lặp là MỘT job — đặt `opts.removeOnComplete` để không làm ngập lịch sử queue.
   */
  everyMs?: number;
  tz?: string;
  data?: unknown;
  opts?: JobSchedulerTemplateOptions;
}

const registry = new Map<string, CronDefinition>();

/**
 * Module job khai lịch lặp lúc import (side-effect, cùng chỗ với `registerJob`
 * trong `*.jobs.ts`) — tập trung một nơi để `syncCronSchedulers()` biết lịch
 * nào đang "sống" và dọn lịch mồ côi khi một module bị gỡ.
 */
export function defineCron(def: CronDefinition): void {
  const hasPattern = def.pattern !== undefined;
  const hasEvery = def.everyMs !== undefined;
  if (hasPattern === hasEvery) {
    throw new Error(`[cron.registry] ${def.schedulerId}: phải khai ĐÚNG MỘT trong "pattern" hoặc "everyMs"`);
  }
  if (hasEvery && !(Number.isInteger(def.everyMs) && (def.everyMs as number) > 0)) {
    throw new Error(`[cron.registry] ${def.schedulerId}: everyMs phải là số nguyên dương (ms)`);
  }
  registry.set(def.schedulerId, def);
}

/** Chặn trần thời gian chờ đồng bộ toàn bộ scheduler — `queueConnection` cấu
 * hình `maxRetriesPerRequest: null` (bắt buộc cho BullMQ) nên MỌI lệnh bên
 * dưới KHÔNG BAO GIỜ tự reject khi Redis mất kết nối, nó xếp hàng chờ
 * reconnect vô thời hạn. Không có `Promise.race` timeout thì `await
 * syncCronSchedulers()` (gọi đồng bộ trong `startServer()`/`worker.ts`) treo
 * khởi động mãi mãi mỗi khi Redis down — cùng lý do đã sửa ở `outboxSignal()`.
 * Hết hạn vẫn an toàn: cron chỉ chưa được lên lịch, lần khởi động sau (hoặc
 * instance khác) sẽ đồng bộ lại. */
const SYNC_TIMEOUT_MS = 10_000;

async function syncCronSchedulersInner(): Promise<void> {
  const queuesTouched = new Set<QueueName>();

  for (const def of registry.values()) {
    queuesTouched.add(def.queue);
    await getQueue(def.queue).upsertJobScheduler(
      def.schedulerId,
      def.everyMs !== undefined ? { every: def.everyMs } : { pattern: def.pattern, tz: def.tz ?? env.CRON_TZ },
      { name: def.jobName, data: def.data ?? {}, opts: def.opts }
    );
  }

  // Dọn scheduler không còn khai trong registry (module job đổi tên/bị gỡ).
  for (const queueName of queuesTouched) {
    const queue = getQueue(queueName);
    const existing = await queue.getJobSchedulers();
    for (const scheduler of existing) {
      if (!scheduler.key || registry.has(scheduler.key)) continue;
      await queue.removeJobScheduler(scheduler.key);
      logger.info("[cron.registry] Đã xoá scheduler không còn khai báo", {
        queue: queueName,
        schedulerId: scheduler.key,
      });
    }
  }

  logger.info(`[cron.registry] Đã đồng bộ ${registry.size} scheduler`);
}

/**
 * Đồng bộ scheduler BullMQ (`Queue.upsertJobScheduler`) với registry hiện tại.
 *
 * ⛔ Gọi đúng 1 lần lúc khởi động, SAU `startWorkers()` — thứ tự "đăng ký job
 * → start worker → upsert scheduler" (p0-04 §2) tránh scheduler kích job đầu
 * tiên trước khi có processor nào xử lý được nó.
 *
 * Idempotent theo thiết kế của BullMQ: `upsertJobScheduler` ghi đè lịch cũ
 * nếu đã tồn tại cùng `schedulerId` (đổi cron pattern không cần xoá tay), và
 * nhiều instance worker cùng gọi hàm này lúc khởi động không tạo lịch trùng.
 */
export async function syncCronSchedulers(): Promise<void> {
  try {
    await Promise.race([
      syncCronSchedulersInner(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Đồng bộ scheduler quá ${SYNC_TIMEOUT_MS}ms`)), SYNC_TIMEOUT_MS).unref();
      }),
    ]);
  } catch (err) {
    logger.warn("[cron.registry] Đồng bộ scheduler thất bại hoặc quá hạn — bỏ qua, thử lại ở lần khởi động sau", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
