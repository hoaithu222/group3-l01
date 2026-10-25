import type { PrintOrder, PrintShop } from "../entities/o2o.interface";
import type { O2oDeps } from "./o2o.deps";
import { adminOrderView, customerOrderView, partnerOrderView, shopBrief, type ShopBrief } from "./o2o.presenter";

/** Dựng view đơn theo lô (2–3 truy vấn cho cả trang, không N+1). */
export class OrderViews {
  constructor(private readonly deps: Pick<O2oDeps, "shops" | "locations" | "directory">) {}

  async shopBriefs(shopIds: string[]): Promise<Map<string, ShopBrief>> {
    const unique = [...new Set(shopIds)];
    const shops = (await Promise.all(unique.map((id) => this.deps.shops.findById(id)))).filter((s): s is PrintShop => s !== null);
    const locations = new Map((await this.deps.locations.findByIds(shops.map((s) => s.locationId))).map((l) => [l.id, l]));
    const out = new Map<string, ShopBrief>();
    for (const s of shops) {
      const brief = shopBrief(s, locations.get(s.locationId) ?? null);
      if (brief) out.set(s.id, brief);
    }
    return out;
  }

  async customer(orders: PrintOrder[]) {
    const briefs = await this.shopBriefs(orders.map((o) => o.shopId));
    return orders.map((o) => customerOrderView(o, briefs.get(o.shopId) ?? null));
  }

  async partner(orders: PrintOrder[]) {
    const users = await this.deps.directory.usersByIds(orders.map((o) => o.userId));
    return orders.map((o) => partnerOrderView(o, users.get(o.userId)?.name ?? null));
  }

  async admin(orders: PrintOrder[]) {
    const [users, briefs] = await Promise.all([
      this.deps.directory.usersByIds(orders.map((o) => o.userId)),
      this.shopBriefs(orders.map((o) => o.shopId)),
    ]);
    return orders.map((o) => {
      const u = users.get(o.userId);
      return adminOrderView(o, u ? { id: u.id, name: u.name } : null, briefs.get(o.shopId) ?? null);
    });
  }
}
