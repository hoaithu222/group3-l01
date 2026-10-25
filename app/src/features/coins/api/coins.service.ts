import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  inventoryEquipPath,
  inventoryUnequipPath,
  ME_INVENTORY_PATH,
  ME_QUESTS_PATH,
  ME_WALLET_PATH,
  ME_WALLET_TRANSACTIONS_PATH,
  questClaimPath,
  SHOP_ITEMS_PATH,
  shopItemBuyPath,
} from './coins.api';
import type {
  BuyResult,
  ClaimResult,
  CoinTransactionsPage,
  CoinTxType,
  InventoryEntry,
  Quest,
  ShopListing,
  Wallet,
} from './coins.types';

/**
 * Ví xu · nhiệm vụ ngày · cửa hàng · kho đồ (p7-02). ⚠️ Mọi lời gọi `skipErrorToast: true`: màn tự hiện lỗi (khối lỗi có "Thử lại", tin
 * trong tấm xác nhận mua, toast của hook ghi) bằng câu `COIN_*` của feature — để interceptor toast thêm là hai câu cho một lỗi.
 */
const QUIET = { skipErrorToast: true } as const;

export const coinsService = {
  async wallet(): Promise<Wallet> {
    return unwrapData<Wallet>(await apiClient.get(ME_WALLET_PATH, QUIET));
  },

  /** ⚠️ `ResponseUtils.cursor` trả `{ data, meta }` ngang hàng — đọc `response.data` trực tiếp (`unwrapData` sẽ bóc mất `meta`). */
  async transactions(params: {
    cursor?: string;
    limit: number;
    type?: CoinTxType;
  }): Promise<CoinTransactionsPage> {
    const response = await apiClient.get<CoinTransactionsPage>(ME_WALLET_TRANSACTIONS_PATH, {
      ...QUIET,
      params,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  async quests(): Promise<Quest[]> {
    return unwrapData<Quest[]>(await apiClient.get(ME_QUESTS_PATH, QUIET));
  },

  /** Nhận thưởng nhiệm vụ HÔM NAY. `COIN_004` đã nhận · `COIN_005` chưa đạt. Không cần `Idempotency-Key`: BE chặn bằng sổ cái (unique theo nhiệm vụ + ngày). */
  async claimQuest(questId: string): Promise<ClaimResult> {
    return unwrapData<ClaimResult>(await apiClient.post(questClaimPath(questId), undefined, QUIET));
  },

  /** Toàn bộ vật phẩm ĐANG bán (danh mục nhỏ — lọc theo loại ở máy, một lượt tải cho cả ba tab). */
  async shopItems(): Promise<ShopListing[]> {
    return unwrapData<ShopListing[]>(await apiClient.get(SHOP_ITEMS_PATH, QUIET));
  },

  /** `Idempotency-Key` BẮT BUỘC (thiếu ⇒ 400). Trả 201. `COIN_001` thiếu xu · `COIN_002` đã sở hữu · `COIN_003` không còn bán. */
  async buy(itemId: string, idempotencyKey: string): Promise<BuyResult> {
    return unwrapData<BuyResult>(
      await apiClient.post(shopItemBuyPath(itemId), undefined, {
        ...QUIET,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    );
  },

  async inventory(): Promise<InventoryEntry[]> {
    return unwrapData<InventoryEntry[]>(await apiClient.get(ME_INVENTORY_PATH, QUIET));
  },

  /** Trang bị: BE tự tháo vật phẩm cùng loại. `id` không thuộc tôi ⇒ 404. */
  async equip(inventoryId: string): Promise<InventoryEntry> {
    return unwrapData<InventoryEntry>(
      await apiClient.post(inventoryEquipPath(inventoryId), undefined, QUIET),
    );
  },

  async unequip(inventoryId: string): Promise<InventoryEntry> {
    return unwrapData<InventoryEntry>(
      await apiClient.post(inventoryUnequipPath(inventoryId), undefined, QUIET),
    );
  },
};
