import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import type { PrintOrder } from "../entities/o2o.interface";
import { canPerform } from "../domain/print-order.state-machine";
import { generatePin, hashPin } from "../domain/pickup-pin";
import type { CancelOrderDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { PRINT_NOTIFICATION } from "./o2o-notifications";
import { OrderViews } from "./order-views";
import { PrintOrderTransitioner } from "./print-order-transitioner";
import { quoteOrThrow } from "./print-quote.helper";

/**
 * Hành động của chủ đơn (be.md §4): gửi đơn (sinh PIN — trả DUY NHẤT lần này), huỷ, tạo PIN mới (PIN cũ vô hiệu).
 * Báo giá được tính lại theo bảng giá HIỆN TẠI lúc gửi rồi snapshot vào đơn — tiệm đổi giá sau đó không ảnh hưởng (IR-15).
 */
export class PrintOrderActionsService {
  private readonly views: OrderViews;
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.views = new OrderViews(deps);
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async submit(user: AuthUser, id: string) {
    const order = await this.own(user, id);
    if (order.status === "DRAFT") this.throwDraftReason(order);
    if (!canPerform("SUBMIT", order.status)) throw o2oErrors.invalidState(order.status);
    if (!order.quote || order.pages === null) throw o2oErrors.noQuote();
    if (order.pages > LIMITS.o2o.orderPagesMax) throw o2oErrors.tooManyPages(LIMITS.o2o.orderPagesMax);
    const shop = await this.deps.shops.findById(order.shopId);
    if (!shop || shop.status !== "APPROVED" || !shop.acceptingOrders) throw o2oErrors.shopNotAccepting();

    const now = this.deps.now();
    const quote = quoteOrThrow(order.pages, order.settings, shop, now);
    const pin = generatePin();
    const updated = await this.transitioner.apply(order, "SUBMIT", {
      actorId: user.id,
      set: { quote, pinHash: hashPin(order.id, pin), submittedAt: now, pageCountError: null },
      notify: { type: PRINT_NOTIFICATION.NEW, recipients: [order.shopOwnerId] },
      partnerNew: true,
    });
    return { order: (await this.views.customer([updated]))[0], pin };
  }

  async cancel(user: AuthUser, id: string, dto: CancelOrderDto) {
    const order = await this.own(user, id);
    const reason = dto.reason?.trim() || null;
    const updated = await this.transitioner.apply(order, "CANCEL", {
      actorId: user.id,
      set: { cancelReason: reason },
      note: reason,
      ...(order.submittedAt !== null && { notify: { type: PRINT_NOTIFICATION.CANCELLED, recipients: [order.shopOwnerId] } }),
    });
    return (await this.views.customer([updated]))[0];
  }

  /** "Tạo PIN mới" khi mất PIN (app không lưu được / đổi máy) — ghi sự kiện, PIN cũ hết hiệu lực ngay. */
  async regeneratePin(user: AuthUser, id: string) {
    const order = await this.own(user, id);
    const pin = generatePin();
    const updated = await this.transitioner.apply(order, "REGENERATE_PIN", { actorId: user.id, set: { pinHash: hashPin(order.id, pin) } });
    return { order: (await this.views.customer([updated]))[0], pin };
  }

  private async own(user: AuthUser, id: string): Promise<PrintOrder> {
    const order = await this.deps.orders.findById(id);
    if (!order || order.userId !== user.id) throw o2oErrors.notFound();
    return order;
  }

  /** DRAFT chưa gửi được: vì tệp lỗi / quá số trang / cấu hình vượt năng lực / chưa đếm xong trang. */
  private throwDraftReason(order: PrintOrder): never {
    switch (order.pageCountError) {
      case ErrorCode.O2O_003:
        throw o2oErrors.invalidFile("UNREADABLE");
      case ErrorCode.O2O_011:
        throw o2oErrors.tooManyPages(LIMITS.o2o.orderPagesMax);
      case ErrorCode.O2O_012:
        throw o2oErrors.invalidPageRange();
      default:
        throw o2oErrors.noQuote();
    }
  }
}
