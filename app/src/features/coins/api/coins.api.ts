/**
 * Đường dẫn endpoint kinh tế ảo Coins (p7-02; `be/src/modules/coins/coins.routes.ts`) — nối sau `appConfig.apiBaseUrl`.
 * Mọi route BE đi qua `requireFeature('coins')` ⇒ cờ tắt trả 404 `CFG_005`. ⚠️ Xu là tiền ẢO: KHÁC hẳn ví chi tiêu nhóm
 * (`features/wallet`, `/workspaces/:id/wallet`, p6-04) — đừng dùng chung đường dẫn/kiểu/khoá cache.
 */
export const ME_WALLET_PATH = '/me/wallet';
export const ME_WALLET_TRANSACTIONS_PATH = '/me/wallet/transactions';
export const ME_QUESTS_PATH = '/me/quests';
export const SHOP_ITEMS_PATH = '/shop/items';
export const ME_INVENTORY_PATH = '/me/inventory';

export const questClaimPath = (questId: string) => `/me/quests/${questId}/claim`;
export const shopItemBuyPath = (itemId: string) => `/shop/items/${itemId}/buy`;
export const inventoryEquipPath = (inventoryId: string) => `/me/inventory/${inventoryId}/equip`;
export const inventoryUnequipPath = (inventoryId: string) => `/me/inventory/${inventoryId}/unequip`;
