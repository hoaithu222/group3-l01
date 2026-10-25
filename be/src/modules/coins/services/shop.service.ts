import { coinErrors } from "../coins.errors";
import type { ShopItemKindValue } from "../entities/coins.interface";
import type { IInventoryRepository, IShopItemRepository } from "../repositories/shop.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import type { CoinLedgerService } from "./coin-ledger.service";
import type { ICoinsEmitter } from "./coins.ports";
import { isOnSale, toInventoryDto, toShopItemDto, type InventoryDto, type ShopItemListDto } from "./coins-presenter";

export interface ShopDeps {
  items: IShopItemRepository;
  inventory: IInventoryRepository;
  ledger: CoinLedgerService;
  tx: ITxRunner;
  emitter: ICoinsEmitter;
  now?: () => Date;
}

/**
 * Cửa hàng vật phẩm hồ sơ + kho đồ (p7-02 be.md §5 "Shop buy", "Equip"). Mua = MỘT transaction: đọc vật phẩm ĐANG bán (bật + trong khung thời gian) → chưa sở hữu → trừ xu qua sổ cái
 * (`SPEND_SHOP`, `refId = itemId`, unique theo người ⇒ mua lại bị chặn kể cả khi hai yêu cầu đua nhau) → tạo dòng kho đồ. Thiếu xu → `COIN_001`, ví KHÔNG đổi; giá lấy từ bản ghi đọc TRONG transaction
 * nên đổi giá giữa chừng không tạo giá lệch. Hai yêu cầu mua khác vật phẩm với số dư chỉ đủ một: điều kiện CAS trên ví cho đúng một cái thắng, cái kia `COIN_001`.
 */
export class ShopService {
  private readonly now: () => Date;

  constructor(private readonly d: ShopDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** Vật phẩm ĐANG bán kèm `owned/equipped/inventoryId` của người gọi. */
  async list(userId: string, kind?: ShopItemKindValue): Promise<ShopItemListDto[]> {
    const now = this.now();
    const [items, inv] = await Promise.all([this.d.items.listActive(kind), this.d.inventory.listByUser(userId, kind)]);
    const owned = new Map(inv.map((x) => [x.itemId, x] as const));
    return items
      .filter((i) => isOnSale(i, now))
      .map((i) => ({ ...toShopItemDto(i), owned: owned.has(i.id), equipped: owned.get(i.id)?.equipped ?? false, inventoryId: owned.get(i.id)?.id ?? null }));
  }

  async buy(userId: string, itemId: string): Promise<{ balance: number; inventoryItem: InventoryDto }> {
    await this.d.ledger.ensureWallets([userId]);
    try {
      const out = await this.d.tx.run(async (tx) => {
        const item = await this.d.items.find(itemId, tx);
        if (!item || !isOnSale(item, this.now())) throw coinErrors.itemUnavailable();
        if (await this.d.inventory.findByItem(userId, item.id, tx)) throw coinErrors.alreadyOwned();
        // `replayed` (đã có dòng SPEND_SHOP nhưng chưa có kho đồ — dữ liệu dở dang) KHÔNG trừ lần hai; vẫn cấp vật phẩm để người dùng không mất xu vô ích.
        const paid = await this.d.ledger.debit(tx, { userId, amount: item.price, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: item.id });
        const inv = await this.d.inventory.create({ userId, itemId: item.id, kind: item.kind }, tx);
        return { item, inv, balance: paid.balance, price: item.price, replayed: paid.replayed };
      });
      if (!out.replayed) this.d.emitter.updated(userId, { coins: { balance: out.balance, delta: -out.price, reason: "SHOP" } });
      return { balance: out.balance, inventoryItem: toInventoryDto(out.inv, out.item) };
    } catch (err) {
      // Dòng sổ cái/kho đồ cùng (người, vật phẩm) đã có (đua với lần mua khác) ⇒ "đã sở hữu".
      if (err instanceof UniqueViolationError) throw coinErrors.alreadyOwned();
      throw err;
    }
  }

  async inventory(userId: string, kind?: ShopItemKindValue): Promise<InventoryDto[]> {
    const inv = await this.d.inventory.listByUser(userId, kind);
    const items = new Map((await this.d.items.findMany([...new Set(inv.map((x) => x.itemId))])).map((i) => [i.id, i] as const));
    return inv.map((x) => toInventoryDto(x, items.get(x.itemId) ?? null));
  }

  /** Trang bị: tháo mọi vật phẩm cùng loại rồi trang bị vật phẩm này — MỘT transaction, tối đa một vật phẩm mỗi loại. `inventoryId` không thuộc người gọi ⇒ 404 (không lộ id người khác). */
  async equip(userId: string, inventoryId: string): Promise<InventoryDto> {
    const inv = await this.d.tx.run(async (tx) => {
      const found = await this.d.inventory.findById(inventoryId, tx);
      if (!found || found.userId !== userId) throw coinErrors.notFound("Không tìm thấy vật phẩm trong kho đồ");
      await this.d.inventory.unequipKind(userId, found.kind, tx);
      const updated = await this.d.inventory.setEquipped(found.id, userId, true, tx);
      if (!updated) throw coinErrors.notFound("Không tìm thấy vật phẩm trong kho đồ");
      return updated;
    });
    return toInventoryDto(inv, await this.d.items.find(inv.itemId));
  }

  async unequip(userId: string, inventoryId: string): Promise<InventoryDto> {
    const inv = await this.d.tx.run(async (tx) => {
      const found = await this.d.inventory.findById(inventoryId, tx);
      if (!found || found.userId !== userId) throw coinErrors.notFound("Không tìm thấy vật phẩm trong kho đồ");
      const updated = await this.d.inventory.setEquipped(found.id, userId, false, tx);
      if (!updated) throw coinErrors.notFound("Không tìm thấy vật phẩm trong kho đồ");
      return updated;
    });
    return toInventoryDto(inv, await this.d.items.find(inv.itemId));
  }
}
