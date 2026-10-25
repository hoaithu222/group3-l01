import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket";
import type { PrintOrder } from "../entities/o2o.interface";
import { getO2oContainer } from "../o2o.container";
import { registerO2oNotificationTypes } from "../services/o2o-notifications";
import { PRINT_ORDER_EVENTS_JOB, type PrintOrderEventPayload } from "../services/print-order-effects";
import { COUNT_PAGES_JOB } from "../services/print-orders.service";

/**
 * Job của `o2o` (p6-05 be.md §7) — nạp bởi `register-jobs.ts` ở cả API (`PROCESS_ROLE=all`) lẫn worker riêng:
 * - `media/print.count-pages` (outbox lúc tạo đơn): đếm trang → báo giá → phát `print-order:updated` cho chủ đơn;
 * - `notifications/print-order.events` (outbox mỗi lần chuyển trạng thái): `print-order:updated` → chủ đơn + chủ tiệm (khi đã gửi),
 *   `partner:order` → chủ tiệm khi đơn vừa gửi (âm báo admin). Không có PIN trong payload;
 * - cron TĨNH `print.order-expire` (15 phút): hết hạn PENDING/READY, nhắc sắp hết hạn, dọn đơn nháp.
 * Loại thông báo `print-order.*` đăng ký ở đây để worker giao được push.
 */
registerO2oNotificationTypes();

function updatedPayload(o: { orderId: string; code: string; status: string; version: number; pages: number | null; total: number | null; updatedAt: string }) {
  return { id: o.orderId, code: o.code, status: o.status, version: o.version, pages: o.pages, total: o.total, updatedAt: o.updatedAt };
}

const fromOrder = (o: PrintOrder) =>
  updatedPayload({ orderId: o.id, code: o.code, status: o.status, version: o.version, pages: o.pages, total: o.quote?.total ?? null, updatedAt: o.updatedAt.toISOString() });

registerJob("media", COUNT_PAGES_JOB, async (job) => {
  const data = job.data as { orderId?: string; assetId?: string };
  if (!data.orderId || !data.assetId) return;
  const order = await getO2oContainer().services.pageCount.handle({ orderId: data.orderId, assetId: data.assetId });
  if (order) emitToUsers([order.userId], SocketEvent.PRINT_ORDER_UPDATED, { ...fromOrder(order), pageCountError: order.pageCountError });
});

registerJob("notifications", PRINT_ORDER_EVENTS_JOB, async (job) => {
  const p = job.data as PrintOrderEventPayload;
  emitToUsers(p.submitted ? [p.userId, p.shopOwnerId] : [p.userId], SocketEvent.PRINT_ORDER_UPDATED, updatedPayload(p));
  if (p.partnerNew) {
    emitToUsers([p.shopOwnerId], SocketEvent.PARTNER_ORDER, {
      shopId: p.shopId,
      orderId: p.orderId,
      code: p.code,
      status: p.status,
      pages: p.pages,
      total: p.total,
      submittedAt: p.submittedAt,
    });
  }
});

registerJob("cron", "print.order-expire", async () => {
  const r = await getO2oContainer().services.expiry.tick();
  if (r.expiredPending + r.expiredReady + r.expiringNotified + r.abandoned > 0) logger.info("[print.order-expire] Đã xử lý đơn tới hạn", { ...r });
});

defineCron({
  schedulerId: "print.order-expire",
  queue: "cron",
  jobName: "print.order-expire",
  pattern: "*/15 * * * *",
  opts: { attempts: 1 },
});
