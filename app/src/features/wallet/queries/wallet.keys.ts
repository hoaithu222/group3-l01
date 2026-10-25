import type { ExpenseFilter, SettlementFilter } from '../api/wallet.types';

/**
 * Khoá cache của ví.
 *
 * ⚠️ LỆCH có chủ đích so với p6-04 app.md §4 (`['wallet','expense', id]`): chi tiết
 * khoản chi nằm DƯỚI `['wallet', wsId, …]` để MỘT lệnh `invalidateQueries(walletKeys.ws(wsId))`
 * — sau mutation hoặc khi nhận `wallet:updated` — làm mới được mọi thứ (số dư,
 * danh sách, chi tiết đang mở). Khoá ngoài `wsId` thì chi tiết một khoản vừa được
 * điều chỉnh vẫn hiện số cũ tới khi hết `staleTime`.
 *
 * ⛔ `filter` LUÔN nằm trong khoá (`api-patterns.md`): thiếu nó thì đổi bộ lọc mà
 * dữ liệu không đổi và người dùng đọc ra là "bộ lọc hỏng".
 */
export const walletKeys = {
  all: ['wallet'] as const,
  ws: (wsId: string) => ['wallet', wsId] as const,
  settings: (wsId: string) => ['wallet', wsId, 'settings'] as const,
  summary: (wsId: string) => ['wallet', wsId, 'summary'] as const,
  expenses: (wsId: string, filter: ExpenseFilter) => ['wallet', wsId, 'expenses', filter] as const,
  recentExpenses: (wsId: string) => ['wallet', wsId, 'expenses', 'recent'] as const,
  expense: (wsId: string, expenseId: string) => ['wallet', wsId, 'expense', expenseId] as const,
  settlements: (wsId: string, filter: SettlementFilter) =>
    ['wallet', wsId, 'settlements', filter] as const,
  /** Settlement PENDING liên quan tôi — dashboard (người nhận xác nhận, người gửi huỷ). */
  pendingSettlements: (wsId: string) => ['wallet', wsId, 'settlements', 'pending'] as const,
  /** ⛔ Chứa SỐ TÀI KHOẢN đầy đủ — `gcTime: 0`, không bao giờ ghi ra đĩa. */
  payee: (wsId: string, userId: string) => ['wallet', wsId, 'payee', userId] as const,
  members: (wsId: string) => ['wallet', wsId, 'members'] as const,
  reminderTargets: (wsId: string) => ['wallet', wsId, 'reminder-targets'] as const,
  paymentProfiles: ['me', 'payment-profiles'] as const,
};
