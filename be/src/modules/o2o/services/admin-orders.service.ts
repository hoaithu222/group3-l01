import type { AuthUser } from "../../../core/types/express";
import type { AdminOrdersQueryDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { PRINT_NOTIFICATION } from "./o2o-notifications";
import { OrderViews } from "./order-views";
import { PrintOrderTransitioner } from "./print-order-transitioner";

/**
 * Vận hành đơn in (`/admin/print-orders*`, `o2o:view|update`): danh sách/chi tiết KHÔNG có PIN hay URL tệp (viewpoint riêng tư),
 * huỷ khi khiếu nại (lý do, audit `print.order-cancel-admin`, thông báo khách + tiệm).
 */
export class AdminOrdersService {
  private readonly views: OrderViews;
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.views = new OrderViews(deps);
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async list(q: AdminOrdersQueryDto) {
    const { data, total } = await this.deps.orders.listAdmin({ ...q, code: q.q });
    return { data: await this.views.admin(data), total };
  }

  async get(id: string) {
    const order = await this.deps.orders.findById(id);
    if (!order) throw o2oErrors.notFound();
    return (await this.views.admin([order]))[0];
  }

  async cancel(actor: AuthUser, id: string, reason: string) {
    const order = await this.deps.orders.findById(id);
    if (!order) throw o2oErrors.notFound();
    const recipients = order.submittedAt !== null ? [order.userId, order.shopOwnerId] : [order.userId];
    const updated = await this.transitioner.apply(order, "ADMIN_CANCEL", {
      actorId: actor.id,
      set: { cancelReason: reason },
      note: reason,
      notify: { type: PRINT_NOTIFICATION.CANCELLED, recipients },
    });
    await this.deps.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "print.order-cancel-admin",
      targetType: "PrintOrder",
      targetId: id,
      reason,
      metadata: { code: order.code, fromStatus: order.status },
    });
    return (await this.views.admin([updated]))[0];
  }
}
