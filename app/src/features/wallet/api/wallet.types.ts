import type { z } from 'zod';

import type {
  cursorMetaSchema,
  expenseDetailViewSchema,
  expenseKindSchema,
  expenseParticipantSchema,
  expenseViewSchema,
  myShareViewSchema,
  reminderTargetTypeSchema,
  settlementMethodSchema,
  settlementStatusSchema,
  shareStatusSchema,
  shareViewSchema,
  splitTypeSchema,
  walletSettingsViewSchema,
  walletSummaryViewSchema,
} from '../schemas/wallet.schemas';
import type {
  paymentInfoViewSchema,
  paymentProfileViewSchema,
  settlementViewSchema,
} from '../schemas/wallet-payments.schemas';

/**
 * Kiểu của tầng API ví nhóm. Kiểu PHẢN HỒI suy ra từ schema Zod
 * (`schemas/wallet.schemas.ts` · `wallet-payments.schemas.ts`) — một nguồn, không có chỗ để hai bên lệch nhau.
 * Kiểu REQUEST khai tay (khớp `wallet/dtos/*.dto.ts` phía BE).
 */

export type ShareStatus = z.infer<typeof shareStatusSchema>;
export type ExpenseKind = z.infer<typeof expenseKindSchema>;
export type SplitType = z.infer<typeof splitTypeSchema>;
export type SettlementMethod = z.infer<typeof settlementMethodSchema>;
export type SettlementStatus = z.infer<typeof settlementStatusSchema>;
export type ReminderTargetType = z.infer<typeof reminderTargetTypeSchema>;

export type WalletSettingsView = z.infer<typeof walletSettingsViewSchema>;
export type MyShareView = z.infer<typeof myShareViewSchema>;
export type ExpenseParticipantView = z.infer<typeof expenseParticipantSchema>;
export type ExpenseView = z.infer<typeof expenseViewSchema>;
export type ShareView = z.infer<typeof shareViewSchema>;
export type ExpenseDetailView = z.infer<typeof expenseDetailViewSchema>;
export type SettlementView = z.infer<typeof settlementViewSchema>;
export type WalletSummaryView = z.infer<typeof walletSummaryViewSchema>;
export type PaymentProfileView = z.infer<typeof paymentProfileViewSchema>;
export type PaymentInfoView = z.infer<typeof paymentInfoViewSchema>;
export type CursorMeta = z.infer<typeof cursorMetaSchema>;

export interface CursorPage<T> {
  items: T[];
  meta: CursorMeta;
}

export type ExpenseCategory = 'FOOD' | 'PRINTING' | 'SERVER' | 'TRANSPORT' | 'MATERIAL' | 'OTHER';

/** Một người trong khoản chia: `amount` chỉ với CUSTOM, `bps` chỉ với PERCENT, EQUAL không kèm gì. */
export interface SplitParticipantPayload {
  userId: string;
  amount?: number;
  bps?: number;
}

export interface CreateExpensePayload {
  amount: number;
  description: string;
  category: ExpenseCategory;
  paidBy: string;
  occurredAt: string;
  receiptAssetId?: string;
  splitType: SplitType;
  participants: SplitParticipantPayload[];
}

export interface UpdateExpensePayload extends Partial<
  Omit<CreateExpensePayload, 'receiptAssetId'>
> {
  /** `null` = gỡ ảnh hoá đơn. */
  receiptAssetId?: string | null;
  expectedVersion: number;
}

/** Bản khai ĐÚNG mới của cả khoản chi — server tự tính chênh lệch (be.md §5). */
export interface AdjustExpensePayload {
  amount: number;
  description: string;
  splitType: SplitType;
  participants: SplitParticipantPayload[];
}

export interface CreateSettlementPayload {
  toId: string;
  amount: number;
  method: SettlementMethod;
  proofAssetId?: string;
  note?: string;
  /** Lấy từ `payment-info` — BE khớp với mã đã cấp cho người gửi. */
  reference?: string;
}

export interface UpdateWalletSettingsPayload {
  reminderEnabled: boolean;
  /** Dạng `m h * * d` (chỉ lịch HẰNG TUẦN — `weeklyCronSchema` của BE). */
  reminderCron: string;
  timezone: string;
  reminderTargetType: ReminderTargetType;
  reminderTargetId?: string | null;
  reminderMinDebt: number;
  expectedVersion: number;
}

export interface CreatePaymentProfilePayload {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  isDefault?: boolean;
}

export interface ExpenseFilter {
  userId?: string;
  category?: string;
  /** ISO. */
  from?: string;
  to?: string;
}

export interface SettlementFilter {
  status?: SettlementStatus;
  mine?: boolean;
}

/** Thành viên NHÓM ở dạng tối thiểu ví cần (tên hiển thị, avatar) — khai riêng, không import chéo feature. */
export interface WalletMember {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  isMe: boolean;
}

/** Lát của `GET /workspaces/:id` mà ví cần — chung khoá cache `['workspaces','detail',wsId]`. */
export interface WalletWorkspaceAccess {
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
}

export interface ReminderTargetOption {
  id: string;
  label: string;
}

export interface ReminderTargets {
  conversations: ReminderTargetOption[];
  channels: ReminderTargetOption[];
}
