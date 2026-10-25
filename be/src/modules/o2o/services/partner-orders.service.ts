import type { AuthUser } from "../../../core/types/express";
import { beforeOf, cursorPage } from "./cursor-page";
import type { PrintOrder } from "../entities/o2o.interface";
import { FILE_DOWNLOAD_STATUSES, PARTNER_VISIBLE_STATUSES, type PrintOrderAction } from "../domain/print-order.state-machine";
import { verifyPin } from "../domain/pickup-pin";
import type { PartnerOrdersQueryDto, PickupDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { PRINT_NOTIFICATION, type PrintNotificationType } from "./o2o-notifications";
import { OrderViews } from "./order-views";
import { PrintOrderTransitioner } from "./print-order-transitioner";

/** Thông báo khách theo hành động của tiệm (README §5). `START_PRINTING` chỉ phát socket. */
const CUSTOMER_NOTICE: Partial<Record<PrintOrderAction, PrintNotificationType>> = {
  ACCEPT: PRINT_NOTIFICATION.ACCEPTED,
  REJECT: PRINT_NOTIFICATION.REJECTED,
  MARK_READY: PRINT_NOTIFICATION.READY,
  PICKUP: PRINT_NOTIFICATION.PICKED_UP,
};

/**
 * Màn partner (chủ tiệm, audience `partner` trên admin — be.md §4). Chỉ đơn ĐÃ GỬI của tiệm mình; tiệm khác → 404 (IR-13).
 * Tệp chỉ tải được khi ACCEPTED/PRINTING (`O2O_006` — IR-08/IR-11); giao hàng bằng PIN có khoá chống dò (IR-09).
 */
export class PartnerOrdersService {
  private readonly views: OrderViews;
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.views = new OrderViews(deps);
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async list(user: AuthUser, q: PartnerOrdersQueryDto) {
    const statuses = q.status ?? PARTNER_VISIBLE_STATUSES;
    const rows = await this.deps.orders.listForOwner(user.id, { statuses, before: beforeOf(q.cursor), limit: q.limit + 1 });
    const { page, meta } = cursorPage(rows, q.limit);
    return { data: await this.views.partner(page), meta };
  }

  async get(user: AuthUser, id: string) {
    return (await this.views.partner([await this.mine(user, id)]))[0];
  }

  async act(user: AuthUser, id: string, action: "ACCEPT" | "START_PRINTING" | "MARK_READY") {
    const order = await this.mine(user, id);
    const now = this.deps.now();
    const updated = await this.transitioner.apply(order, action, {
      actorId: user.id,
      set: action === "MARK_READY" ? { readyAt: now } : action === "ACCEPT" ? { fileAccessUntil: null } : {},
      ...(CUSTOMER_NOTICE[action] && { notify: { type: CUSTOMER_NOTICE[action] as PrintNotificationType, recipients: [order.userId] } }),
    });
    return (await this.views.partner([updated]))[0];
  }

  async reject(user: AuthUser, id: string, reason: string) {
    const order = await this.mine(user, id);
    const updated = await this.transitioner.apply(order, "REJECT", {
      actorId: user.id,
      set: { rejectReason: reason },
      note: reason,
      notify: { type: PRINT_NOTIFICATION.REJECTED, recipients: [order.userId] },
    });
    return (await this.views.partner([updated]))[0];
  }

  /** URL ký tải tệp in (TTL theo trần của `assets`) + audit `print.file-download`. */
  async file(user: AuthUser, id: string) {
    const order = await this.mine(user, id);
    if (!FILE_DOWNLOAD_STATUSES.includes(order.status)) throw o2oErrors.fileNotAvailable();
    const signed = await this.deps.assets.signedUrl(order.fileAssetId, user, "attachment");
    await this.deps.audit.record({
      actorId: user.id,
      actorRole: "partner",
      action: "print.file-download",
      targetType: "PrintOrder",
      targetId: order.id,
      metadata: { code: order.code, shopId: order.shopId },
    });
    return { ...signed, fileName: order.fileName };
  }

  /** Giao hàng: khoá chống dò (Redis) → so HMAC hằng thời gian → PICKED_UP (+ đã thu tiền nếu `markPaid`). */
  async pickup(user: AuthUser, id: string, dto: PickupDto) {
    const order = await this.mine(user, id);
    if (order.status !== "READY") throw o2oErrors.invalidState(order.status);
    await this.deps.pinLockout.check(order.id);
    if (!verifyPin(order.id, dto.pin, order.pinHash)) {
      const r = await this.deps.pinLockout.fail(order.id);
      throw r.locked ? o2oErrors.pinLocked(r.retryAfterSeconds) : o2oErrors.wrongPin(r.attemptsLeft);
    }
    await this.deps.pinLockout.reset(order.id);
    const now = this.deps.now();
    const updated = await this.transitioner.apply(order, "PICKUP", {
      actorId: user.id,
      set: {
        pickedUpAt: now,
        ...(dto.markPaid && { payment: { ...order.payment, status: "PAID" as const, confirmedBy: user.id, confirmedAt: now } }),
      },
      notify: { type: PRINT_NOTIFICATION.PICKED_UP, recipients: [order.userId] },
    });
    return (await this.views.partner([updated]))[0];
  }

  /** Đánh dấu đã thu tiền tại quầy (D-11 bước 1) — gọi lại khi đã PAID trả nguyên đơn (idempotent). */
  async markPaid(user: AuthUser, id: string) {
    const order = await this.mine(user, id);
    if (order.payment.status === "PAID") return (await this.views.partner([order]))[0];
    const now = this.deps.now();
    const updated = await this.transitioner.apply(order, "MARK_PAID", {
      actorId: user.id,
      set: { payment: { ...order.payment, status: "PAID", confirmedBy: user.id, confirmedAt: now } },
    });
    return (await this.views.partner([updated]))[0];
  }

  /** Đơn ĐÃ GỬI của tiệm do tôi sở hữu — khác → 404 trung tính (IR-13). */
  private async mine(user: AuthUser, id: string): Promise<PrintOrder> {
    const order = await this.deps.orders.findById(id);
    if (!order || order.shopOwnerId !== user.id || order.submittedAt === null) throw o2oErrors.notFound();
    return order;
  }
}
