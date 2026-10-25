import type { AuthUser } from "../../../core/types/express";
import type { PrintShop } from "../entities/o2o.interface";
import type { QuoteDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { shopPublicView } from "./o2o.presenter";
import { quoteOrThrow, toSettings } from "./print-quote.helper";

/**
 * Tiệm in phía người dùng (`GET /print-shops/:id`, `POST /print-shops/:id/quote`) và phía chủ tiệm (`/partner/shops*`).
 * Tiệm chưa APPROVED → 404 với người dùng (không lộ tiệm đang chờ duyệt).
 */
export class PrintShopsService {
  constructor(private readonly deps: O2oDeps) {}

  async getPublic(id: string) {
    const shop = await this.approved(id);
    const location = await this.deps.locations.findById(shop.locationId);
    return shopPublicView(shop, location);
  }

  /** Báo giá thử — KHÔNG lưu (be.md §4). */
  async quote(id: string, dto: QuoteDto) {
    const shop = await this.approved(id);
    return quoteOrThrow(dto.pages, toSettings(dto.settings), shop, this.deps.now());
  }

  /** `GET /partner/shops/me` — mọi tiệm tôi sở hữu (kể cả đang chờ duyệt/tạm ngưng — màn "Tài khoản" hiện trạng thái). */
  async myShops(user: AuthUser) {
    const shops = await this.deps.shops.listByOwner(user.id);
    const locations = new Map((await this.deps.locations.findByIds(shops.map((s) => s.locationId))).map((l) => [l.id, l]));
    return shops.map((s) => ({
      ...shopPublicView(s, locations.get(s.locationId) ?? null),
      status: s.status,
      suspendedReason: s.suspendedReason,
      approvedAt: s.approvedAt,
    }));
  }

  /** `POST /partner/shops/:id/accepting` — chủ tiệm bật/tắt nhận đơn mới. */
  async setAccepting(user: AuthUser, id: string, acceptingOrders: boolean) {
    const shop = await this.deps.shops.setAccepting(id, user.id, acceptingOrders);
    if (!shop) throw o2oErrors.notFound();
    await this.deps.audit.record({
      actorId: user.id,
      actorRole: "partner",
      action: "print.shop-accepting",
      targetType: "PrintShop",
      targetId: shop.id,
      metadata: { acceptingOrders },
    });
    return { id: shop.id, acceptingOrders: shop.acceptingOrders };
  }

  private async approved(id: string): Promise<PrintShop> {
    const shop = await this.deps.shops.findById(id);
    if (!shop || shop.status !== "APPROVED") throw o2oErrors.notFound();
    return shop;
  }
}
