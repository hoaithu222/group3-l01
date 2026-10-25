import { LIMITS } from "../../../core/constants/limits";
import type { PrintOrder, PrintOrderEvent } from "../entities/o2o.interface";
import { isTerminal, nextStatus, type PrintOrderAction } from "../domain/print-order.state-machine";
import type { OrderSetPatch } from "../repositories/print-order.repository.interface";
import type { TxHandle } from "../repositories/tx";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { PrintOrderEffects } from "./print-order-effects";
import type { PrintNotificationType } from "./o2o-notifications";

/** Nhãn dòng thời gian cho hành động KHÔNG đổi trạng thái (tạo PIN mới, đánh dấu đã thu tiền). */
const SAME_STATUS_EVENT: Partial<Record<PrintOrderAction, string>> = {
  REGENERATE_PIN: "PIN_REGENERATED",
  MARK_PAID: "PAID",
};

export interface TransitionOptions {
  actorId: string | null;
  set?: OrderSetPatch;
  note?: string | null;
  notify?: { type: PrintNotificationType; recipients: string[] };
  partnerNew?: boolean;
  /** Việc thêm trong CÙNG transaction (vd kiểm lại dữ liệu) — chạy SAU khi CAS thành công. */
  within?: (tx: TxHandle, updated: PrintOrder) => Promise<void>;
}

/**
 * MỘT đường ghi cho mọi chuyển trạng thái đơn in (be.md §5): bảng thuần `nextStatus` → CAS `(id, status, version)` + sự kiện
 * dòng thời gian + (trạng thái kết thúc ⇒ `fileAccessUntil = now + 24 h`) → thông báo + outbox socket trong cùng transaction.
 * CAS thua (đơn vừa đổi ở nơi khác) → `O2O_004` như chuyển sai trạng thái.
 */
export class PrintOrderTransitioner {
  private readonly effects: PrintOrderEffects;

  constructor(private readonly deps: Pick<O2oDeps, "orders" | "tx" | "notifier" | "outbox" | "now">) {
    this.effects = new PrintOrderEffects(deps);
  }

  async apply(order: PrintOrder, action: PrintOrderAction, opts: TransitionOptions): Promise<PrintOrder> {
    const to = nextStatus(action, order.status);
    if (!to) throw o2oErrors.invalidState(order.status);
    const now = this.deps.now();
    const set: OrderSetPatch = { ...opts.set };
    if (to !== order.status) set.status = to;
    if (to !== order.status && isTerminal(to)) {
      set.fileAccessUntil = new Date(now.getTime() + LIMITS.o2o.fileAccessGraceHours * 3_600_000);
    }
    const label = to !== order.status ? to : SAME_STATUS_EVENT[action];
    const event: PrintOrderEvent | undefined = label ? { status: label, at: now, by: opts.actorId, note: opts.note ?? null } : undefined;

    return this.deps.tx.run(async (tx) => {
      const updated = await this.deps.orders.transition(order.id, { from: order.status, version: order.version, set, event }, tx);
      if (!updated) throw o2oErrors.invalidState(order.status);
      if (opts.within) await opts.within(tx, updated);
      await this.effects.record(tx, updated, { actorId: opts.actorId, notify: opts.notify, partnerNew: opts.partnerNew });
      return updated;
    });
  }
}
