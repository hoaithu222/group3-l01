import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.client";
import { logger } from "../logger";
import { consumeSignalMark } from "../queue/outbox/tx-signals";
import { outboxSignal } from "../queue/outbox/outbox.writer";

const MAX_RETRIES = 5;
const TRANSIENT_MARKERS = ["TransientTransactionError", "WriteConflict"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") return true;
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Bọc `prisma.$transaction` với timeout cố định + retry tối đa 3 lần khi
 * MongoDB trả lỗi transient (tranh chấp ghi giữa các transaction đồng thời —
 * `P2034` hoặc message chứa `TransientTransactionError`/`WriteConflict`).
 * Các lỗi khác (business logic, validation...) propagate ngay, không retry.
 *
 * Nếu `fn` gọi `outbox.add(tx, ...)`, transaction được đánh dấu — sau khi
 * commit thành công, tự PUBLISH `outboxSignal()` để `outbox.relay` xử lý
 * ngay thay vì chờ tới lượt poll fallback. Transaction không đụng outbox thì
 * không tốn thêm 1 round-trip Redis nào.
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let attempt = 0;
  let touchedOutbox = false;

  for (;;) {
    attempt += 1;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const value = await fn(tx);
        touchedOutbox = consumeSignalMark(tx);
        return value;
      }, { maxWait: 5000, timeout: 10000 });

      if (touchedOutbox) await outboxSignal();
      return result;
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isTransientError(err)) throw err;
      logger.warn("[withTransaction] Lỗi transient, thử lại", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      // Backoff nhỏ + jitter TRƯỚC khi thử lại — không có bước này, nhiều
      // transaction cùng tranh 1 document (vd CAS `remainingUses` invite link
      // — be.md MB-08, 20 request đồng thời) sẽ liên tục đụng lại NHAU ngay
      // lập tức ở mỗi lần retry ("thundering herd"), dễ ăn hết `MAX_RETRIES`
      // dù mỗi lỗi riêng lẻ đều transient (phát hiện lúc viết test tích hợp
      // p1-02 MB-08 — trước đó chưa có test nào tạo đủ tranh chấp ghi đồng
      // thời để lộ ra).
      await sleep(10 * attempt + Math.floor(Math.random() * 20));
    }
  }
}
