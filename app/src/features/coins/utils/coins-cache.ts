import type { QueryClient } from '@tanstack/react-query';

import type {
  BuyResult,
  InventoryEntry,
  Quest,
  ShopItemKind,
  ShopListing,
  Wallet,
} from '../api/coins.types';
import { coinsKeys } from '../queries/coins.keys';

/**
 * Các hàm THUẦN vá cache sau khi mua/nhận thưởng/trang bị — dùng cho cập nhật lạc quan và cho `onSuccess`. Server luôn là nguồn đúng: mỗi lần vá
 * xong hook vẫn làm mới phần cần đối chiếu (`invalidate`), nên vá ở đây chỉ để màn đổi NGAY thay vì chờ một vòng mạng.
 */

/** Đổi số dư và cộng dồn bộ đếm trọn đời (`earned` khi nhận, `spent` khi tiêu). Chưa có ví trong cache ⇒ giữ nguyên (đừng bịa số 0 cho các trường còn lại). */
export function patchWallet(
  wallet: Wallet | undefined,
  patch: { balance: number; earned?: number; spent?: number },
): Wallet | undefined {
  if (!wallet) return wallet;
  return {
    ...wallet,
    balance: patch.balance,
    lifetimeEarned: wallet.lifetimeEarned + (patch.earned ?? 0),
    lifetimeSpent: wallet.lifetimeSpent + (patch.spent ?? 0),
  };
}

/** Đánh dấu nhiệm vụ đã nhận (nút đổi thành "Đã nhận" ngay, không chờ tải lại). */
export function markQuestClaimed(
  quests: Quest[] | undefined,
  questId: string,
): Quest[] | undefined {
  return quests?.map((entry) =>
    entry.quest.id === questId
      ? { ...entry, claimable: false, claimedAt: new Date().toISOString() }
      : entry,
  );
}

/** Vật phẩm vừa mua ⇒ "Đã có" trong cửa hàng (chưa trang bị). */
export function markShopOwned(
  items: ShopListing[] | undefined,
  entry: InventoryEntry,
): ShopListing[] | undefined {
  return items?.map((item) =>
    item.id === entry.itemId
      ? { ...item, equipped: entry.equipped, inventoryId: entry.id, owned: true }
      : item,
  );
}

/** Thêm dòng kho đồ vừa có (không trùng: mua lặp/đua với socket không tạo hai dòng). */
export function addInventoryEntry(
  entries: InventoryEntry[] | undefined,
  entry: InventoryEntry,
): InventoryEntry[] | undefined {
  if (!entries) return entries;
  return entries.some((existing) => existing.id === entry.id) ? entries : [entry, ...entries];
}

/**
 * Trang bị/tháo MỘT vật phẩm trong kho: tối đa một vật phẩm mỗi loại nên trang bị cái mới là tháo mọi cái CÙNG LOẠI (đúng luật server,
 * để màn không nháy hai vật phẩm cùng "Đang dùng" rồi mới sửa).
 */
export function setEquipped(
  entries: InventoryEntry[] | undefined,
  target: { id: string; kind: ShopItemKind },
  equipped: boolean,
): InventoryEntry[] | undefined {
  return entries?.map((entry) => {
    if (entry.id === target.id) return { ...entry, equipped };
    if (equipped && entry.kind === target.kind) return { ...entry, equipped: false };
    return entry;
  });
}

/** Cùng luật `setEquipped` cho danh sách cửa hàng (nhận diện bằng `inventoryId`). */
export function setShopEquipped(
  items: ShopListing[] | undefined,
  target: { id: string; kind: ShopItemKind },
  equipped: boolean,
): ShopListing[] | undefined {
  return items?.map((item) => {
    if (item.inventoryId === target.id) return { ...item, equipped };
    if (equipped && item.kind === target.kind && item.equipped) return { ...item, equipped: false };
    return item;
  });
}

/** Sau khi mua thành công: ví (trừ xu), cửa hàng ("Đã có"), kho đồ (dòng mới); lịch sử có dòng mới nên báo cũ. */
export function applyPurchase(queryClient: QueryClient, price: number, result: BuyResult): void {
  queryClient.setQueryData<Wallet>(coinsKeys.wallet(), (old) =>
    patchWallet(old, { balance: result.balance, spent: price }),
  );
  queryClient.setQueryData<ShopListing[]>(coinsKeys.shop(), (old) =>
    markShopOwned(old, result.inventoryItem),
  );
  queryClient.setQueryData<InventoryEntry[]>(coinsKeys.inventory(), (old) =>
    addInventoryEntry(old, result.inventoryItem),
  );
  void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
  void queryClient.invalidateQueries({ queryKey: coinsKeys.transactionsAll() });
  void queryClient.invalidateQueries({ queryKey: coinsKeys.inventory() });
}
