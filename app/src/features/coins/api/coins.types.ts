/**
 * Kiểu phản hồi kinh tế ảo Coins — khớp `coins-presenter.ts` + `coins.interface.ts` ở BE (p7-02). Chỉ ĐỌC + mua/nhận/trang bị của
 * CHÍNH người dùng: không có endpoint cộng/chuyển xu hay xem ví người khác. Ngày là chuỗi ISO. Xu là SỐ NGUYÊN.
 */

/** Loại dòng sổ cái. `SPEND_MARKETPLACE`/`EARN_SALE`/`BURN_FEE` chỉ có khi chợ tài liệu (P1) mở — vẫn khai để không vỡ khi BE trả. */
export type CoinTxType =
  | 'EARN_EVENT'
  | 'EARN_QUEST'
  | 'SPEND_SHOP'
  | 'SPEND_MARKETPLACE'
  | 'EARN_SALE'
  | 'BURN_FEE'
  | 'REFUND'
  | 'ADJUST_ADMIN';

export type ShopItemKind = 'AVATAR_FRAME' | 'PROFILE_THEME' | 'EMOJI_PACK';

/** `GET /me/wallet`. Chưa từng có xu ⇒ toàn số 0 (BE không tạo ví khi đọc). */
export interface Wallet {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  /** Xu nhận từ SỰ KIỆN trong ngày địa phương của tôi (thưởng nhiệm vụ nhận chủ động KHÔNG tính vào trần này). */
  todayEarned: number;
  dailyCap: number;
}

export interface CoinTransaction {
  id: string;
  type: CoinTxType;
  /** Có dấu: nhận dương, tiêu âm. */
  amount: number;
  balanceAfter: number;
  refType: string;
  /** Với `EARN_EVENT` là `<nguồn XP>:<id>` (vd `TASK_ON_TIME:abc`). */
  refId: string;
  at: string;
}

export interface CoinTransactionsPage {
  data: CoinTransaction[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

/** `GET /me/quests` — nhiệm vụ HÔM NAY (ngày theo múi giờ của tôi). `progress` đã kẹp ≤ `target`. */
export interface Quest {
  quest: {
    id: string;
    code: string;
    title: string;
    description: string;
    coins: number;
    order: number;
  };
  progress: number;
  target: number;
  claimable: boolean;
  claimedAt: string | null;
}

export interface ShopItem {
  id: string;
  code: string;
  name: string;
  kind: ShopItemKind;
  price: number;
  /** ⚠️ Luôn `null` ở P0 (BE chưa có `AssetScope SHOP_ITEM`) — hình vật phẩm dựng từ `data`. */
  assetId: string | null;
  /** Token hiển thị theo `kind` (BE kiểm `.strict()`): khung `{ color, width }` · theme `{ primary, accent }` · emoji `{ emojis[] }`. */
  data: Record<string, unknown> | null;
  availableFrom: string | null;
  availableTo: string | null;
}

/** `GET /shop/items` — chỉ vật phẩm ĐANG bán, kèm trạng thái sở hữu của tôi. */
export interface ShopListing extends ShopItem {
  owned: boolean;
  equipped: boolean;
  inventoryId: string | null;
}

export interface InventoryEntry {
  id: string;
  itemId: string;
  kind: ShopItemKind;
  equipped: boolean;
  acquiredAt: string;
  /** `null` khi vật phẩm đã bị gỡ khỏi danh mục (dữ liệu cũ). */
  item: ShopItem | null;
}

export interface ClaimResult {
  balance: number;
  delta: number;
}

export interface BuyResult {
  balance: number;
  inventoryItem: InventoryEntry;
}

/** Lý do đổi số dư trong `gamification:updated.coins.reason`. */
export type CoinChangeReason = 'EARN_EVENT' | 'QUEST' | 'SHOP' | 'SALE' | 'REFUND' | 'ADJUST';

/**
 * Phần `coins` của `gamification:updated` (BE `CoinsUpdatedPayload`). ⚠️ Sự kiện CHỈ mang `coins` (không `xp/level/streak`) và chỉ để
 * đồng bộ nhanh — nguồn đúng luôn là `GET /me/wallet`. Khai lại ở đây thay vì import kiểu của `features/gamification` (cấm import chéo).
 */
export interface CoinsChange {
  balance: number;
  delta: number;
  reason: CoinChangeReason;
}
