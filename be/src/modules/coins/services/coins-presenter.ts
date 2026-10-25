import type { CoinQuest, CoinQuestMetric, CoinRule, CoinTransaction, CoinTxTypeValue, InventoryItem, ShopItem, ShopItemKindValue } from "../entities/coins.interface";

/** DTO trả cho client (ngày là ISO). ⛔ Không có trường nội bộ (`updatedBy`), không userId của người khác; `note`/`actorId` (lý do điều chỉnh của admin) CHỈ ở DTO admin. */
export interface WalletDto {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  /** Xu đã nhận từ sự kiện trong ngày địa phương của tôi / trần ngày hiệu lực. */
  todayEarned: number;
  dailyCap: number;
}

export interface CoinTransactionDto {
  id: string;
  type: CoinTxTypeValue;
  amount: number;
  balanceAfter: number;
  refType: string;
  refId: string;
  at: string;
}

export interface AdminCoinTransactionDto extends CoinTransactionDto {
  note: string | null;
  actorId: string | null;
  counterpartyId: string | null;
}

export interface ShopItemDto {
  id: string;
  code: string;
  name: string;
  kind: ShopItemKindValue;
  price: number;
  assetId: string | null;
  data: Record<string, unknown> | null;
  availableFrom: string | null;
  availableTo: string | null;
}

export interface ShopItemListDto extends ShopItemDto {
  owned: boolean;
  equipped: boolean;
  inventoryId: string | null;
}

export interface AdminShopItemDto extends ShopItemDto {
  isActive: boolean;
  version: number;
  /** Số người đang sở hữu (mọi lần mua đều tạo một dòng kho đồ). */
  owners: number;
}

export interface InventoryDto {
  id: string;
  itemId: string;
  kind: ShopItemKindValue;
  equipped: boolean;
  acquiredAt: string;
  /** `null` khi vật phẩm đã bị xoá khỏi danh mục (chưa có thao tác xoá ở P0 — phòng dữ liệu cũ). */
  item: ShopItemDto | null;
}

export interface QuestDto {
  quest: { id: string; code: string; title: string; description: string; coins: number; order: number };
  progress: number;
  target: number;
  claimable: boolean;
  claimedAt: string | null;
}

export interface AdminQuestDto {
  id: string;
  code: string;
  title: string;
  description: string;
  metric: CoinQuestMetric;
  target: number;
  coins: number;
  isActive: boolean;
  order: number;
  version: number;
}

export interface AdminRuleDto {
  sourceType: string;
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
  version: number;
  /** Xu đã phát theo luật này trong 7 ngày gần nhất. */
  issued7d: number;
}

export interface EquippedItemView {
  kind: ShopItemKindValue;
  itemId: string;
  code: string;
  name: string;
  assetId: string | null;
  data: Record<string, unknown> | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const toCoinTransactionDto = (t: CoinTransaction): CoinTransactionDto => ({
  id: t.id,
  type: t.type,
  amount: t.amount,
  balanceAfter: t.balanceAfter,
  refType: t.refType,
  refId: t.refId,
  at: t.at.toISOString(),
});

export const toAdminCoinTransactionDto = (t: CoinTransaction): AdminCoinTransactionDto => ({ ...toCoinTransactionDto(t), note: t.note, actorId: t.actorId, counterpartyId: t.counterpartyId });

export const toShopItemDto = (i: ShopItem): ShopItemDto => ({
  id: i.id,
  code: i.code,
  name: i.name,
  kind: i.kind,
  price: i.price,
  assetId: i.assetId,
  data: i.data,
  availableFrom: iso(i.availableFrom),
  availableTo: iso(i.availableTo),
});

export const toAdminShopItemDto = (i: ShopItem, owners: number): AdminShopItemDto => ({ ...toShopItemDto(i), isActive: i.isActive, version: i.version, owners });

export const toInventoryDto = (inv: InventoryItem, item: ShopItem | null): InventoryDto => ({
  id: inv.id,
  itemId: inv.itemId,
  kind: inv.kind,
  equipped: inv.equipped,
  acquiredAt: inv.acquiredAt.toISOString(),
  item: item ? toShopItemDto(item) : null,
});

export const toQuestDto = (q: CoinQuest, progress: number, claimedAt: Date | null): QuestDto => ({
  quest: { id: q.id, code: q.code, title: q.title, description: q.description, coins: q.coins, order: q.order },
  progress: Math.min(progress, q.target),
  target: q.target,
  claimable: claimedAt === null && progress >= q.target,
  claimedAt: iso(claimedAt),
});

export const toAdminQuestDto = (q: CoinQuest): AdminQuestDto => ({
  id: q.id,
  code: q.code,
  title: q.title,
  description: q.description,
  metric: q.metric,
  target: q.target,
  coins: q.coins,
  isActive: q.isActive,
  order: q.order,
  version: q.version,
});

export const toAdminRuleDto = (r: CoinRule, issued7d: number): AdminRuleDto => ({ sourceType: r.sourceType, coins: r.coins, dailyCap: r.dailyCap, isActive: r.isActive, version: r.version, issued7d });

/** Vật phẩm ĐANG bán tại `now`: bật và trong khung thời gian (mốc `null` = không giới hạn phía đó). */
export function isOnSale(item: Pick<ShopItem, "isActive" | "availableFrom" | "availableTo">, now: Date): boolean {
  if (!item.isActive) return false;
  if (item.availableFrom && item.availableFrom > now) return false;
  if (item.availableTo && item.availableTo <= now) return false;
  return true;
}
