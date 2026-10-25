/**
 * Kiểu miền của module `wallet` (p6-04) — khai ĐỘC LẬP với Prisma (cùng giá trị)
 * để service/domain không import kiểu Prisma (`.claude/rules/architecture.md`).
 * Tiền luôn là SỐ NGUYÊN đồng.
 */
export const SPLIT_TYPES = ["EQUAL", "CUSTOM", "PERCENT"] as const;
export type SplitTypeValue = (typeof SPLIT_TYPES)[number];

export const EXPENSE_KINDS = ["EXPENSE", "ADJUSTMENT"] as const;
export type ExpenseKindValue = (typeof EXPENSE_KINDS)[number];

export const SHARE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "VOID"] as const;
export type ShareStatusValue = (typeof SHARE_STATUSES)[number];

export const SETTLEMENT_METHODS = ["CASH", "BANK", "OTHER"] as const;
export type SettlementMethodValue = (typeof SETTLEMENT_METHODS)[number];

export const SETTLEMENT_STATUSES = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"] as const;
export type SettlementStatusValue = (typeof SETTLEMENT_STATUSES)[number];

export const REMINDER_TARGETS = ["NONE", "CONVERSATION", "CHANNEL"] as const;
export type ReminderTargetValue = (typeof REMINDER_TARGETS)[number];

export interface WalletSettings {
  id: string;
  workspaceId: string;
  currency: string;
  enabled: boolean;
  reminderEnabled: boolean;
  reminderCron: string;
  timezone: string;
  reminderTargetType: ReminderTargetValue;
  reminderTargetId: string | null;
  reminderMinDebt: number;
  lastRemindedAt: Date | null;
  lastManualRemindAt: Date | null;
  walletVersion: number;
  version: number;
}

export interface ExpenseParticipantRow {
  userId: string;
  amount: number | null;
  bps: number | null;
}

export interface Expense {
  id: string;
  workspaceId: string;
  kind: ExpenseKindValue;
  adjustsExpenseId: string | null;
  amount: number;
  description: string;
  category: string;
  paidBy: string;
  splitType: SplitTypeValue;
  participants: ExpenseParticipantRow[];
  receiptAssetId: string | null;
  occurredAt: Date;
  createdBy: string;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  workspaceId: string;
  debtorId: string;
  creditorId: string;
  amount: number;
  paidAmount: number;
  status: ShareStatusValue;
  occurredAt: Date;
}

export interface SettlementAllocationRow {
  shareId: string;
  amount: number;
}

export interface Settlement {
  id: string;
  workspaceId: string;
  code: string;
  fromId: string;
  toId: string;
  amount: number;
  method: SettlementMethodValue;
  proofAssetId: string | null;
  note: string | null;
  status: SettlementStatusValue;
  allocations: SettlementAllocationRow[];
  createdBy: string;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  cancelledAt: Date | null;
  staleNotifiedAt: Date | null;
  version: number;
  createdAt: Date;
}

export interface WalletBalanceRow {
  userId: string;
  balance: number;
  owedTotal: number;
}

/** Hồ sơ nhận tiền — KHÔNG mang số TK đầy đủ ra khỏi service trừ `getPayeePaymentInfo`. */
export interface PaymentProfile {
  id: string;
  userId: string;
  bankBin: string;
  accountNumberEnc: string;
  accountLast4: string;
  accountName: string;
  isDefault: boolean;
  createdAt: Date;
}

// ── Response shapes (hợp đồng với app/admin) ─────────────────────────────────

export interface WalletSettingsView {
  workspaceId: string;
  currency: string;
  enabled: boolean;
  reminderEnabled: boolean;
  reminderCron: string;
  timezone: string;
  reminderTargetType: ReminderTargetValue;
  reminderTargetId: string | null;
  reminderMinDebt: number;
  lastRemindedAt: Date | null;
  walletVersion: number;
  version: number;
  myActions: { canManageSettings: boolean; canRemind: boolean };
}

export interface MyShareView {
  amount: number;
  paidAmount: number;
  status: ShareStatusValue;
}

export interface ExpenseView {
  id: string;
  workspaceId: string;
  kind: ExpenseKindValue;
  adjustsExpenseId: string | null;
  amount: number;
  description: string;
  category: string;
  paidBy: string;
  splitType: SplitTypeValue;
  participants: ExpenseParticipantRow[];
  receiptAssetId: string | null;
  occurredAt: Date;
  createdBy: string;
  version: number;
  createdAt: Date;
  myShare: MyShareView | null;
  /** Người tạo hoặc ADMIN+ — client dùng để ẩn/hiện Sửa/Xoá/Điều chỉnh. */
  canManage: boolean;
}

export interface ShareView {
  id: string;
  debtorId: string;
  creditorId: string;
  amount: number;
  paidAmount: number;
  status: ShareStatusValue;
}

export interface ExpenseDetailView extends ExpenseView {
  shares: ShareView[];
  adjustments: ExpenseView[];
}

export interface SettlementView {
  id: string;
  workspaceId: string;
  code: string;
  fromId: string;
  toId: string;
  amount: number;
  method: SettlementMethodValue;
  proofAssetId: string | null;
  note: string | null;
  status: SettlementStatusValue;
  allocations: SettlementAllocationRow[];
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
}

export interface WalletSummaryView {
  currency: string;
  myBalance: number;
  balances: { userId: string; balance: number }[];
  suggestions: { fromId: string; toId: string; amount: number }[];
  totals: { expensesThisMonth: number; outstanding: number };
  walletVersion: number;
}

export interface PaymentProfileView {
  id: string;
  bankBin: string;
  bankName: string | null;
  accountLast4: string;
  accountName: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface PaymentInfoView {
  bankBin: string;
  bankName: string | null;
  accountNumber: string;
  accountName: string;
  suggestedAmount: number;
  /** Mã 8 ký tự dùng làm nội dung chuyển khoản `SA <reference>`; gửi lại khi tạo settlement để khớp. */
  reference: string;
}

export type SpendBand = "LT_500K" | "500K_2M" | "2M_10M" | "GT_10M";

/** `GET /admin/workspaces/:id/wallet-stats` — chỉ tổng hợp ẩn danh (admin.md §2.1), KHÔNG có userId/số tiền chính xác. */
export interface WalletStatsView {
  enabled: boolean;
  reminder: {
    enabled: boolean;
    cronText: string;
    targetType: ReminderTargetValue;
    targetChannelName: string | null;
  };
  last30d: {
    expensesCount: number;
    confirmedSettlements: number;
    staleSettlements: number;
    debtorsCount: number;
    spendBand: SpendBand;
  };
}
