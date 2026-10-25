import type { CoinTxType } from '../api/coins.types';

/**
 * Khoá cache kinh tế ảo. Đăng xuất: `wipeUserData()` gọi `queryClient.clear()` nên không cần dọn riêng.
 * ⚠️ Cùng tiền tố `['coins', …]` cho MỌI thứ của feature — ví chi tiêu nhóm (`features/wallet`) dùng tiền tố khác, đừng nhầm.
 */
export const coinsKeys = {
  all: ['coins'] as const,
  wallet: () => ['coins', 'wallet'] as const,
  /** Tiền tố của MỌI danh sách lịch sử (mọi bộ lọc) — để làm mới cùng lúc khi số dư đổi. */
  transactionsAll: () => ['coins', 'transactions'] as const,
  /** Bộ lọc `type` là tham số của kết quả ⇒ nằm TRONG key (thiếu thì đổi tab mà danh sách không đổi). */
  transactions: (type: CoinTxType | undefined) =>
    ['coins', 'transactions', { type: type ?? null }] as const,
  quests: () => ['coins', 'quests'] as const,
  shop: () => ['coins', 'shop'] as const,
  inventory: () => ['coins', 'inventory'] as const,
};
