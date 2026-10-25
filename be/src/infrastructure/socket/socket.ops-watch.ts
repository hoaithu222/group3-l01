/**
 * @file socket.ops-watch.ts
 * @description "Có admin đang xem dashboard realtime (room `admin:ops`)?" — cho cron `ops.stats-broadcast` (p0-03 admin.md) biết có nên tốn một lượt quét
 * connection registry hay không. Job chạy ở WORKER (không có `getIO()`, không `fetchSockets`) nên tín hiệu đi qua khoá Redis:
 *  · socket vào `admin:ops` → `createOpsWatch().start()` đặt khoá (TTL 75 s) và gia hạn mỗi 30 s cho tới khi socket rời room/ngắt kết nối;
 *  · client KHÔNG cần heartbeat riêng (admin web không gửi `presence:heartbeat`), khoá tự hết hạn ≤ 75 s sau khi admin cuối rời đi.
 * Mọi thao tác Redis best-effort: lỗi chỉ log — cùng nguyên tắc `socket.viewing.ts`.
 */
import { redis } from "../redis";
import { logger } from "../logger";

export const OPS_WATCH_KEY = "ops:stats:watch";
export const OPS_WATCH_TTL_SECONDS = 75;
/** Nhịp gia hạn — nhỏ hơn TTL và bằng chu kỳ cron nên khoá không bao giờ hết hạn khi vẫn còn người xem. */
export const OPS_WATCH_REFRESH_MS = 30_000;

export async function touchOpsWatch(): Promise<void> {
  try {
    await redis.set(OPS_WATCH_KEY, "1", OPS_WATCH_TTL_SECONDS);
  } catch (err) {
    logger.warn("[socket.ops-watch] Không ghi được khoá theo dõi ops, bỏ qua", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Worker/API đọc. Redis lỗi → `false` (bỏ lượt phát — số liệu vận hành không đáng để quét mù). */
export async function hasOpsWatchers(): Promise<boolean> {
  try {
    return await redis.exists(OPS_WATCH_KEY);
  } catch {
    return false;
  }
}

export interface OpsWatch {
  /** Idempotent — gọi lại khi đang chạy không tạo thêm timer. */
  start(): void;
  /** Idempotent — dừng gia hạn (khoá tự hết hạn). */
  stop(): void;
}

/** Bộ gia hạn RIÊNG của một socket (mỗi socket trong `admin:ops` một timer `unref`, dừng khi rời room/ngắt kết nối). */
export function createOpsWatch(): OpsWatch {
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    start() {
      if (timer) return;
      void touchOpsWatch();
      timer = setInterval(() => void touchOpsWatch(), OPS_WATCH_REFRESH_MS);
      timer.unref();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
