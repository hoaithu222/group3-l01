import { LIMITS } from "../../../core/constants/limits";
import type { PrintOrder } from "../entities/o2o.interface";
import type { DueKind } from "../repositories/print-order.repository.interface";
import type { O2oDeps } from "./o2o.deps";
import { PRINT_NOTIFICATION } from "./o2o-notifications";
import { PrintOrderTransitioner } from "./print-order-transitioner";

const HOUR_MS = 3_600_000;

export interface ExpiryTickResult {
  expiredPending: number;
  expiredReady: number;
  expiringNotified: number;
  abandoned: number;
}

/**
 * Cron TĨNH `print.order-expire` (15 phút, be.md §7 — IR-14): PENDING quá `pendingExpireHours` / READY quá `readyExpireDays` →
 * EXPIRED + thông báo khách + tiệm (tệp hết quyền sau `fileAccessGraceHours`); READY còn ≤ `expiringNoticeHours` → nhắc khách
 * MỘT lần; DRAFT/QUOTED bỏ dở quá `draftExpireHours` → CANCELLED (không thông báo). Mỗi đơn đi qua CAS — tick chạy chồng vô hại.
 */
export class PrintOrderExpiryService {
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async tick(): Promise<ExpiryTickResult> {
    const o2o = LIMITS.o2o;
    const now = this.deps.now().getTime();
    const readyTtl = o2o.readyExpireDays * 24 * HOUR_MS;
    return {
      expiredPending: await this.each("PENDING_EXPIRE", new Date(now - o2o.pendingExpireHours * HOUR_MS), (o) => this.expire(o)),
      expiredReady: await this.each("READY_EXPIRE", new Date(now - readyTtl), (o) => this.expire(o)),
      expiringNotified: await this.each("READY_EXPIRING", new Date(now - readyTtl + o2o.expiringNoticeHours * HOUR_MS), (o) =>
        this.transitioner.apply(o, "NOTIFY_EXPIRING", {
          actorId: null,
          set: { expiringNotifiedAt: this.deps.now() },
          notify: { type: PRINT_NOTIFICATION.EXPIRING, recipients: [o.userId] },
        })
      ),
      abandoned: await this.each("DRAFT_ABANDON", new Date(now - o2o.draftExpireHours * HOUR_MS), (o) =>
        this.transitioner.apply(o, "ABANDON", { actorId: null, set: { cancelReason: "Đơn nháp quá hạn" }, note: "Đơn nháp quá hạn" })
      ),
    };
  }

  private expire(order: PrintOrder) {
    return this.transitioner.apply(order, "EXPIRE", {
      actorId: null,
      notify: { type: PRINT_NOTIFICATION.EXPIRED, recipients: [order.userId, order.shopOwnerId] },
    });
  }

  private async each(kind: DueKind, threshold: Date, fn: (o: PrintOrder) => Promise<unknown>): Promise<number> {
    let done = 0;
    for (const order of await this.deps.orders.findDue(kind, threshold, LIMITS.o2o.cronBatch)) {
      try {
        await fn(order);
        done += 1;
      } catch {
        // CAS thua (đơn vừa đổi ở nơi khác) — lượt sau quét lại nếu còn tới hạn.
      }
    }
    return done;
  }
}
