import type { AuthUser } from "../../../core/types/express";
import { roleHasPermission } from "../../../core/constants/permissions";
import type { PrintShop } from "../entities/o2o.interface";
import type { AdminShopDto, AdminShopUpdateDto, AdminShopsQueryDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { PRINT_NOTIFICATION } from "./o2o-notifications";
import { PrintOrderTransitioner } from "./print-order-transitioner";
import { shopPublicView } from "./o2o.presenter";

const DAY_MS = 86_400_000;
const SUSPEND_REJECT_REASON = "Tiệm tạm ngưng";

/**
 * Vận hành tiệm in (`/admin/print-shops*`): tạo (chủ tiệm tra theo email — `O2O_009`), sửa bảng giá/năng lực (lý do, audit,
 * `version++` — đơn đã gửi giữ snapshot báo giá, IR-15), duyệt (`o2o:approve`) → chủ tiệm có `partner:*` ≤ 60 s, tạm ngưng →
 * đơn PENDING tự REJECTED "Tiệm tạm ngưng". Duyệt/tạm ngưng xoá cache quyền theo dữ liệu (không đá phiên).
 */
export class AdminShopsService {
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async list(actor: AuthUser, q: AdminShopsQueryDto) {
    const { data, total } = await this.deps.shops.listAdmin(q);
    return { data: await this.views(actor, data), total };
  }

  async get(actor: AuthUser, id: string) {
    const shop = await this.must(id);
    const [view] = await this.views(actor, [shop]);
    return { ...view, pendingOrders: await this.deps.orders.countByShopStatus(id, ["PENDING"]) };
  }

  async create(actor: AuthUser, dto: AdminShopDto) {
    const [owner, location, existing] = await Promise.all([
      this.deps.directory.findUserByEmail(dto.ownerEmail),
      this.deps.locations.findById(dto.locationId),
      this.deps.shops.findByLocationId(dto.locationId),
    ]);
    if (!owner || owner.status !== "ACTIVE") throw o2oErrors.ownerNotFound();
    if (!location) throw o2oErrors.notFound();
    if (location.type !== "PRINT_SHOP" || existing) throw o2oErrors.shopLocationConflict();
    const shop = await this.deps.shops.create({
      locationId: location.id,
      ownerUserId: owner.id,
      displayName: dto.displayName,
      phone: dto.phone ?? null,
      priceTable: dto.priceTable,
      capabilities: dto.capabilities,
    });
    await this.audit(actor, "print.shop-create", shop.id, undefined, { locationId: location.id, ownerUserId: owner.id });
    return (await this.views(actor, [shop]))[0];
  }

  async update(actor: AuthUser, id: string, dto: AdminShopUpdateDto) {
    const cur = await this.must(id);
    const { expectedVersion, reason, ...patch } = dto;
    const shop = await this.deps.shops.update(id, expectedVersion, patch);
    if (!shop) throw o2oErrors.versionConflict(cur.version);
    await this.audit(actor, "print.shop-update", id, reason, {
      fields: Object.keys(patch),
      ...(patch.priceTable && { priceTableFrom: cur.priceTable, priceTableTo: patch.priceTable }),
    });
    return (await this.views(actor, [shop]))[0];
  }

  async approve(actor: AuthUser, id: string, reason: string) {
    const shop = await this.deps.shops.setStatus(id, ["PENDING", "SUSPENDED"], {
      status: "APPROVED",
      approvedBy: actor.id,
      approvedAt: this.deps.now(),
      suspendedReason: null,
    });
    if (!shop) throw await this.stateError(id);
    await this.deps.dataPermissions.invalidate(shop.ownerUserId);
    await this.audit(actor, "print.shop-approve", id, reason, { ownerUserId: shop.ownerUserId });
    return (await this.views(actor, [shop]))[0];
  }

  async suspend(actor: AuthUser, id: string, reason: string) {
    const shop = await this.deps.shops.setStatus(id, ["PENDING", "APPROVED"], { status: "SUSPENDED", suspendedReason: reason });
    if (!shop) throw await this.stateError(id);
    await this.deps.dataPermissions.invalidate(shop.ownerUserId);
    let rejected = 0;
    for (const order of await this.deps.orders.listByShopStatus(id, ["PENDING"], 1000)) {
      try {
        await this.transitioner.apply(order, "REJECT", {
          actorId: actor.id,
          set: { rejectReason: SUSPEND_REJECT_REASON },
          note: SUSPEND_REJECT_REASON,
          notify: { type: PRINT_NOTIFICATION.REJECTED, recipients: [order.userId] },
        });
        rejected += 1;
      } catch {
        // Đơn vừa đổi trạng thái ở nơi khác (tiệm vừa nhận) — bỏ qua, vận hành xử lý tay nếu cần.
      }
    }
    await this.audit(actor, "print.shop-suspend", id, reason, { rejectedOrders: rejected });
    return { ...(await this.views(actor, [shop]))[0], rejectedOrders: rejected };
  }

  private async views(actor: AuthUser, shops: PrintShop[]) {
    const showEmail = roleHasPermission(actor.role, "user:view");
    const [owners, locations, counts] = await Promise.all([
      this.deps.directory.usersByIds(shops.map((s) => s.ownerUserId)),
      this.deps.locations.findByIds(shops.map((s) => s.locationId)),
      this.deps.orders.countByShopsSince(shops.map((s) => s.id), new Date(this.deps.now().getTime() - 30 * DAY_MS)),
    ]);
    const locById = new Map(locations.map((l) => [l.id, l]));
    return shops.map((s) => {
      const o = owners.get(s.ownerUserId);
      return {
        ...shopPublicView(s, locById.get(s.locationId) ?? null),
        status: s.status,
        approvedAt: s.approvedAt,
        suspendedReason: s.suspendedReason,
        owner: { id: s.ownerUserId, name: o?.name ?? "Người dùng", ...(showEmail && o && { email: o.email }) },
        orders30d: counts.get(s.id) ?? 0,
        version: s.version,
        createdAt: s.createdAt,
      };
    });
  }

  private async must(id: string): Promise<PrintShop> {
    const shop = await this.deps.shops.findById(id);
    if (!shop) throw o2oErrors.notFound();
    return shop;
  }

  private async stateError(id: string) {
    const shop = await this.must(id);
    return o2oErrors.invalidState(shop.status);
  }

  private async audit(actor: AuthUser, action: string, targetId: string, reason?: string, metadata?: Record<string, unknown>) {
    await this.deps.audit.record({ actorId: actor.id, actorRole: actor.role, action, targetType: "PrintShop", targetId, reason, metadata });
  }
}
