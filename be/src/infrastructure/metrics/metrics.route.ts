import type { Request, Response } from "express";
import { registry, queueWaiting, queueDelayed, outboxPending, livekitRoomsActive } from "./metrics.client";
import { livekitParticipantsActive } from "./media-ops.metrics";
import { readRoomsSnapshot } from "../media/rooms-snapshot";
import { getQueue, QUEUE_NAMES } from "../queue";
import { prisma } from "../database";
import { env } from "../../core/config";

/** Chặn trần thời gian mỗi lệnh `getJobCounts` — `queueConnection` (ioredis)
 * cấu hình `maxRetriesPerRequest: null` (bắt buộc cho BullMQ) nên lệnh KHÔNG
 * BAO GIỜ tự reject khi Redis mất kết nối, nó xếp hàng chờ reconnect vô thời
 * hạn — không có timeout thì `GET /metrics` treo vô thời hạn mỗi khi Redis
 * down (cùng lý do đã sửa ở `outboxSignal()`/`router.ts#/health`). */
const QUEUE_GAUGE_TIMEOUT_MS = 3000;

/** Nạp lại `queue_waiting{queue}`/`queue_delayed{queue}` ngay trước khi scrape — tránh phải poll định kỳ. */
async function refreshQueueGauge(): Promise<void> {
  await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      try {
        const counts = await Promise.race([
          getQueue(name).getJobCounts("waiting", "delayed"),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error("getJobCounts quá hạn")), QUEUE_GAUGE_TIMEOUT_MS).unref();
          }),
        ]);
        queueWaiting.set({ queue: name }, counts.waiting ?? 0);
        queueDelayed.set({ queue: name }, counts.delayed ?? 0);
      } catch {
        // Redis/queue không khả dụng lúc scrape — giữ giá trị cũ, không chặn các metric khác.
      }
    })
  );
}

/** Nạp lại `outbox_pending` ngay trước khi scrape — cùng pattern với `refreshQueueGauge()`. */
async function refreshOutboxGauge(): Promise<void> {
  try {
    const count = await prisma.outboxEvent.count({
      where: { status: { in: ["PENDING", "DISPATCHING"] } },
    });
    outboxPending.set(count);
  } catch {
    // DB không khả dụng lúc scrape — giữ giá trị cũ.
  }
}

/**
 * Nạp lại `livekit_rooms_active` từ ảnh chụp Redis do cron `media.rooms-snapshot` (worker) ghi — worker là tiến trình
 * riêng nên gauge trong bộ nhớ của nó không hiện ở `/metrics` của API (p0-08). Chưa có ảnh chụp (voice/meeting tắt,
 * hoặc quá TTL) → giữ giá trị hiện tại.
 */
async function refreshLivekitGauge(): Promise<void> {
  const snapshot = await readRoomsSnapshot();
  if (!snapshot) return;
  livekitRoomsActive.set(snapshot.rooms);
  livekitParticipantsActive.set(snapshot.participants);
}

function isLocalRequest(req: Request): boolean {
  const ip = req.ip ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * `GET /metrics` (không versioned, không qua `authenticateToken`) — bảo vệ
 * bằng `Authorization: Bearer METRICS_TOKEN` khi gọi từ ngoài localhost.
 * `METRICS_TOKEN` trống → chỉ localhost được phép (dev/scrape nội bộ).
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  if (!isLocalRequest(req)) {
    const header = req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!env.METRICS_TOKEN || token !== env.METRICS_TOKEN) {
      res.status(401).json({
        success: false,
        error: { code: "AUTH_002", message: "Không có quyền truy cập /metrics" },
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
  await Promise.all([refreshQueueGauge(), refreshOutboxGauge(), refreshLivekitGauge()]);
  res.setHeader("Content-Type", registry.contentType);
  res.send(await registry.metrics());
}
