import { randomUUID } from "crypto";
import { prisma } from "../../database";
import { logger } from "../../logger";
import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { outboxDispatchDuration, outboxFailedTotal } from "../../metrics";
import { enqueue, type QueueName } from "../queues";
import { OUTBOX_SIGNAL_CHANNEL } from "./outbox.writer";
import { queueConnection } from "../queue.client";

/**
 * ⚠️ File này CHỈ chứa hàm thuần (không `registerJob`/`defineCron` ở top-level)
 * — nó được export lại qua `infrastructure/queue/index.ts`, import ở RẤT
 * nhiều nơi (health check, metrics, mọi service dùng `enqueue`). Đăng ký
 * processor/cron cho `outbox.relay` nằm ở `outbox.jobs.ts` (side-effect file,
 * chỉ import qua `register-jobs.ts`) — tách riêng để import file này KHÔNG
 * vô tình đăng ký processor trước khi `registerAllJobs()` chạy.
 */

/** Định danh duy nhất của process — set vào `lockedBy` lúc claim, chỉ để quan sát/debug. */
export const INSTANCE_ID = randomUUID();

/** Thời gian giữ khoá DISPATCHING trước khi 1 instance khác được phép claim lại (event kẹt do crash). */
const LOCK_MS = 30_000;

/** Dạng rút gọn của tài liệu Mongo trả về bởi `findAndModify` (MongoDB Extended JSON). */
interface RawOutboxDoc {
  _id: { $oid: string };
  type: string;
  aggregateType: string;
  aggregateId: string;
  queue: string;
  jobName: string;
  payload: unknown;
  dedupeKey: string;
  delayMs?: number | null;
  attempts: number;
  createdAt: { $date: string };
}

function toExtDate(d: Date): { $date: string } {
  return { $date: d.toISOString() };
}

/**
 * BullMQ `Job.create()` ném `"Custom Id cannot contain :"` cho MỌI `jobId`
 * tuỳ biến có dấu `:` TRỪ đúng trường hợp 3 phần/2 dấu `:` (giữ tương thích
 * ngược với repeatable job cũ — xem `node_modules/bullmq/dist/cjs/classes/job.js`,
 * điều kiện `jobId.includes(":") && jobId.split(":").length !== 3`). Quy ước
 * `dedupeKey` của `outbox.add()` (`<type>:<entity>:<id>[:version]`) thường ra
 * 4-5 phần — phát hiện lúc viết test tích hợp p1-02 gọi thật `enqueue()` qua
 * relay (trước đó mọi test khác đều mock outbox/relay nên chưa lộ). Thay vì
 * bắt MỌI dedupeKey trong codebase phải tự đếm đúng 2 dấu `:` (dễ tái phạm),
 * đổi hẳn `:` → `_` ở ĐÚNG BƯỚC dùng làm `jobId` — `dedupeKey` gốc vẫn giữ
 * nguyên trong Mongo (unique index, hiển thị debug), chỉ `jobId` truyền cho
 * BullMQ là bản đã thế ký tự.
 */
function toSafeJobId(dedupeKey: string): string {
  return dedupeKey.replace(/:/g, "_");
}

/**
 * Claim NGUYÊN TỬ đúng 1 `OutboxEvent` sẵn sàng xử lý — Prisma Client (JS) không
 * có `findOneAndUpdate` kèm `sort`, nên dùng `$runCommandRaw` gọi thẳng lệnh
 * MongoDB `findAndModify` (be.md §5.2). Điều kiện: PENDING đã tới hạn HOẶC
 * DISPATCHING nhưng khoá đã hết hạn (instance giữ khoá trước đó đã chết).
 */
async function claimOne(now: Date): Promise<RawOutboxDoc | null> {
  const result = (await prisma.$runCommandRaw({
    findAndModify: "OutboxEvent",
    query: {
      $or: [
        { status: "PENDING", availableAt: { $lte: toExtDate(now) } },
        { status: "DISPATCHING", lockedUntil: { $lt: toExtDate(now) } },
      ],
    },
    sort: { availableAt: 1 },
    update: {
      $set: {
        status: "DISPATCHING",
        lockedUntil: toExtDate(new Date(now.getTime() + LOCK_MS)),
        lockedBy: INSTANCE_ID,
      },
      $inc: { attempts: 1 },
    },
    new: true,
  })) as unknown as { value: RawOutboxDoc | null };
  return result.value ?? null;
}

/** Enqueue BullMQ cho 1 event đã claim, cập nhật trạng thái theo kết quả (be.md §5.2). */
async function dispatchClaimed(doc: RawOutboxDoc): Promise<void> {
  const id = doc._id.$oid;
  const createdAt = new Date(doc.createdAt.$date);

  try {
    await enqueue(doc.queue as QueueName, doc.jobName, doc.payload, {
      jobId: toSafeJobId(doc.dedupeKey),
      delay: doc.delayMs ?? undefined,
    });
    const dispatchedAt = new Date();
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "DISPATCHED", dispatchedAt, lockedUntil: null },
    });
    outboxDispatchDuration.observe((dispatchedAt.getTime() - createdAt.getTime()) / 1000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (doc.attempts >= LIMITS.outbox.maxAttempts) {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: "FAILED", lastError: message, lockedUntil: null },
      });
      outboxFailedTotal.inc();
      logger.error("[outbox.relay] Event chuyển FAILED sau nhiều lần thử", {
        id,
        type: doc.type,
        attempts: doc.attempts,
        error: message,
      });
    } else {
      const backoffSeconds = Math.min(2 ** doc.attempts, 300);
      await prisma.outboxEvent.update({
        where: { id },
        data: {
          status: "PENDING",
          availableAt: new Date(Date.now() + backoffSeconds * 1000),
          lockedUntil: null,
          lastError: message,
        },
      });
      logger.warn("[outbox.relay] Dispatch lỗi, đã lên lịch thử lại", {
        id,
        type: doc.type,
        attempts: doc.attempts,
        backoffSeconds,
        error: message,
      });
    }
  }
}

/**
 * Claim + dispatch tối đa `env.OUTBOX_RELAY_BATCH` event trong 1 lượt gọi.
 * Dùng cho cả vòng lặp relay (signal/poll) lẫn job `outbox.relay` (cron an toàn).
 * Trả về số event đã xử lý (dùng để biết còn khả năng tồn đọng hay không).
 */
export async function drainOutboxBatch(): Promise<number> {
  const now = new Date();
  let processed = 0;
  for (; processed < env.OUTBOX_RELAY_BATCH; processed += 1) {
    const doc = await claimOne(now);
    if (!doc) break;
    await dispatchClaimed(doc);
  }
  return processed;
}

let running = false;
let draining = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriber: ReturnType<typeof queueConnection.duplicate> | null = null;

/** Chặn trần thời gian chờ subscribe — `queueConnection` cấu hình
 * `maxRetriesPerRequest: null` (bắt buộc cho BullMQ) nên lệnh KHÔNG BAO GIỜ
 * tự reject khi Redis mất kết nối, nó xếp hàng chờ reconnect vô thời hạn.
 * Không có `Promise.race` timeout ở đây thì `await startOutboxRelay()`
 * (gọi đồng bộ trong `startServer()`) treo khởi động mãi mãi mỗi khi Redis
 * down — cùng lý do đã sửa ở `outboxSignal()` trong file `outbox.writer.ts`.
 * Hết hạn vẫn an toàn: relay chạy tiếp bằng poll fallback (`OUTBOX_POLL_MS`). */
const SUBSCRIBE_TIMEOUT_MS = 5000;

/** Rào chắn không cho 2 lượt drain chạy song song trong CÙNG 1 process (signal + poll trùng lúc). */
async function safeDrain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    let processed: number;
    do {
      processed = await drainOutboxBatch();
    } while (processed === env.OUTBOX_RELAY_BATCH);
  } catch (err) {
    logger.error("[outbox.relay] Lỗi khi drain batch", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    draining = false;
  }
}

/**
 * Khởi động relay: subscriber Redis riêng lắng kênh signal (xử lý gần như
 * ngay lập tức khi có event mới) + poll fallback mỗi `OUTBOX_POLL_MS` (đề
 * phòng mất tín hiệu Pub/Sub — Redis Pub/Sub không đảm bảo gửi lại).
 * Gọi 1 lần lúc khởi động (`server.ts`/`worker.ts`), y hệt `startWorkers()`.
 */
export async function startOutboxRelay(): Promise<void> {
  if (running) return;
  running = true;

  const sub = queueConnection.duplicate();
  subscriber = sub;
  sub.on("error", (err) => {
    logger.warn("[outbox.relay] subscriber Redis lỗi", { error: err.message });
  });
  try {
    await Promise.race([
      sub.subscribe(OUTBOX_SIGNAL_CHANNEL),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`Subscribe quá ${SUBSCRIBE_TIMEOUT_MS}ms`)),
          SUBSCRIBE_TIMEOUT_MS
        ).unref();
      }),
    ]);
    sub.on("message", () => {
      void safeDrain();
    });
  } catch (err) {
    logger.warn("[outbox.relay] Không thể subscribe kênh signal — chỉ dựa vào poll fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  pollTimer = setInterval(() => void safeDrain(), env.OUTBOX_POLL_MS);

  void safeDrain(); // xử lý ngay tồn đọng từ trước (vd sau khi restart)
  logger.info("[outbox.relay] Đã khởi động", { instanceId: INSTANCE_ID, pollMs: env.OUTBOX_POLL_MS });
}

/** Dừng sạch relay — gọi trong graceful shutdown TRƯỚC khi đóng Worker/Queue/Redis. */
export async function stopOutboxRelay(): Promise<void> {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (subscriber) {
    await subscriber.quit().catch(() => undefined);
    subscriber = null;
  }
}
