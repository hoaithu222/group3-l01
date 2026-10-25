import type { IInventoryRepository, IShopItemRepository } from "../repositories/shop.repository.interface";
import type { EquippedItemView } from "./coins-presenter";

/**
 * Đọc vật phẩm hồ sơ ĐANG TRANG BỊ của nhiều người (khung avatar, theme, gói emoji) — cổng công khai cho module hồ sơ (`coins/public.ts`), CHỈ ĐỌC. Trả token hiển thị (`data`), không trả giá,
 * không trả thời điểm mua. Người không trang bị gì không xuất hiện trong map. Việc CÓ được hiện cho người xem hay không (chung nhóm, quyền riêng tư…) là quyết định của module hồ sơ gọi hàm này.
 */
export class EquippedItemsReader {
  constructor(
    private readonly inventory: IInventoryRepository,
    private readonly items: IShopItemRepository
  ) {}

  async forUsers(userIds: readonly string[]): Promise<Map<string, EquippedItemView[]>> {
    const equipped = await this.inventory.equippedByUsers([...new Set(userIds)]);
    if (equipped.length === 0) return new Map();
    const items = new Map((await this.items.findMany([...new Set(equipped.map((e) => e.itemId))])).map((i) => [i.id, i] as const));
    const out = new Map<string, EquippedItemView[]>();
    for (const e of equipped) {
      const item = items.get(e.itemId);
      if (!item) continue;
      const list = out.get(e.userId) ?? [];
      list.push({ kind: e.kind, itemId: item.id, code: item.code, name: item.name, assetId: item.assetId, data: item.data });
      out.set(e.userId, list);
    }
    return out;
  }
}
