import type { PrintOrder } from "../entities/o2o.interface";
import type { TxHandle } from "../repositories/tx";
import type { O2oDeps } from "./o2o.deps";
import type { PrintNotificationType } from "./o2o-notifications";

/** Payload outbox `print-order.events` (queue `notifications`) → consumer phát socket `print-order:updated` / `partner:order`. */
export interface PrintOrderEventPayload {
  orderId: string;
  code: string;
  status: string;
  version: number;
  userId: string;
  shopId: string;
  shopOwnerId: string;
  /** Đơn đã gửi (tiệm được biết) — trước khi gửi chỉ chủ đơn nhận `print-order:updated`. */
  submitted: boolean;
  /** Vừa gửi → thêm `partner:order` cho chủ tiệm (âm báo đơn mới ở admin). */
  partnerNew: boolean;
  pages: number | null;
  total: number | null;
  submittedAt: string | null;
  updatedAt: string;
}

export const PRINT_ORDER_EVENTS_JOB = "print-order.events";

/**
 * Tác động BỀN của một lần chuyển trạng thái — ghi TRONG CÙNG transaction với CAS (reuse-first: outbox, `notify()`):
 * thông báo (hộp thư + push) cho người nhận chỉ định và một dòng outbox để phát socket sau commit.
 */
export class PrintOrderEffects {
  constructor(private readonly deps: Pick<O2oDeps, "notifier" | "outbox">) {}

  async record(
    tx: TxHandle,
    order: PrintOrder,
    opts: { actorId: string | null; notify?: { type: PrintNotificationType; recipients: string[] }; partnerNew?: boolean }
  ): Promise<void> {
    const recipients = [...new Set(opts.notify?.recipients ?? [])].filter((id) => id !== opts.actorId);
    if (opts.notify && recipients.length > 0) {
      await this.deps.notifier.notify(tx, {
        type: opts.notify.type,
        ...(opts.actorId && { actorId: opts.actorId }),
        scope: null,
        source: { type: "print-order", id: `${order.id}-${opts.notify.type}-v${order.version}` },
        refs: { orderId: order.id, code: order.code },
        recipients: recipients.map((userId) => ({ userId })),
        dedupeKey: `${opts.notify.type}:${order.id}:v${order.version}`,
      });
    }
    const payload: PrintOrderEventPayload = {
      orderId: order.id,
      code: order.code,
      status: order.status,
      version: order.version,
      userId: order.userId,
      shopId: order.shopId,
      shopOwnerId: order.shopOwnerId,
      submitted: order.submittedAt !== null,
      partnerNew: opts.partnerNew === true,
      pages: order.pages,
      total: order.quote?.total ?? null,
      submittedAt: order.submittedAt ? order.submittedAt.toISOString() : null,
      updatedAt: order.updatedAt.toISOString(),
    };
    await this.deps.outbox.add(tx, {
      type: "print-order.status",
      aggregateType: "PrintOrder",
      aggregateId: order.id,
      queue: "notifications",
      jobName: PRINT_ORDER_EVENTS_JOB,
      payload: payload as unknown as Record<string, unknown>,
      dedupeKey: `print-order.events:${order.id}:v${order.version}`,
    });
  }
}
