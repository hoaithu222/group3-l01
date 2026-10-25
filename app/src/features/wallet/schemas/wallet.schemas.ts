import { z } from 'zod';

import { isoDate, money, nullable } from './schema-helpers';

/**
 * Schema Zod của mọi PHẢN HỒI `/wallet`, `/expenses`, `/settlements`,
 * `/me/payment-profiles` (p6-04 be.md §4, `wallet.interface.ts` phía BE).
 *
 * ── Vì sao parse cả phản hồi, không chỉ khai kiểu ────────────────────────────
 * Đây là DỮ LIỆU TIỀN. `z.number().int()` chặn số thực lọt vào (BE đổi sang
 * Decimal, hay một lượt ép kiểu sai) trước khi nó ra màn hình dưới dạng
 * "37.500,5 VND". Trường phụ BE thêm về sau bị bỏ qua (`z.object` mặc định
 * không strict) nên parse không làm app giòn với thay đổi tương thích ngược.
 *
 * ⚠️ `nullable()` ở đây LUÔN chấp nhận cả vắng mặt: BE serializer bỏ trường
 * `undefined` khỏi JSON, nên `null` và "không có" là MỘT nghĩa. Đầu ra luôn là
 * `null` để nơi dùng chỉ phải xử lý một dạng.
 *
 * ⚠️ Số dư (`balance`, `myBalance`) ÂM được — `money` không chặn dấu. Chỗ cần
 * dương (số tiền khoản chi, settlement) do FORM kiểm, không do schema phản hồi.
 */

export const shareStatusSchema = z.enum(['UNPAID', 'PARTIAL', 'PAID', 'VOID']);
export const expenseKindSchema = z.enum(['EXPENSE', 'ADJUSTMENT']);
export const splitTypeSchema = z.enum(['EQUAL', 'CUSTOM', 'PERCENT']);
export const settlementMethodSchema = z.enum(['CASH', 'BANK', 'OTHER']);
export const settlementStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED']);
export const reminderTargetTypeSchema = z.enum(['NONE', 'CONVERSATION', 'CHANNEL']);

export const walletSettingsViewSchema = z.object({
  workspaceId: z.string(),
  currency: z.string(),
  enabled: z.boolean(),
  reminderEnabled: z.boolean(),
  reminderCron: z.string(),
  timezone: z.string(),
  reminderTargetType: reminderTargetTypeSchema,
  reminderTargetId: nullable(z.string()),
  reminderMinDebt: money,
  lastRemindedAt: nullable(isoDate),
  walletVersion: money,
  version: money,
  myActions: z.object({ canManageSettings: z.boolean(), canRemind: z.boolean() }),
});

export const myShareViewSchema = z.object({
  amount: money,
  paidAmount: money,
  status: shareStatusSchema,
});

export const expenseParticipantSchema = z.object({
  userId: z.string(),
  amount: nullable(money),
  bps: nullable(money),
});

export const expenseViewSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: expenseKindSchema,
  adjustsExpenseId: nullable(z.string()),
  /** ⚠️ Khoản ĐIỀU CHỈNH có thể ÂM (giảm nợ) — hiển thị bằng chữ "giảm", không dấu trừ trần. */
  amount: money,
  description: z.string(),
  /** Chuỗi, không phải enum: BE có thể mở rộng `LIMITS.wallet.categories` mà không phá app cũ. */
  category: z.string(),
  paidBy: z.string(),
  splitType: splitTypeSchema,
  participants: z.array(expenseParticipantSchema),
  receiptAssetId: nullable(z.string()),
  occurredAt: isoDate,
  createdBy: z.string(),
  version: money,
  createdAt: isoDate,
  myShare: nullable(myShareViewSchema),
  canManage: z.boolean(),
});

export const shareViewSchema = z.object({
  id: z.string(),
  debtorId: z.string(),
  creditorId: z.string(),
  amount: money,
  paidAmount: money,
  status: shareStatusSchema,
});

export const expenseDetailViewSchema = expenseViewSchema.extend({
  shares: z.array(shareViewSchema),
  adjustments: z.array(expenseViewSchema),
});

export const walletSummaryViewSchema = z.object({
  currency: z.string(),
  /** `> 0` được nợ · `< 0` đang nợ. */
  myBalance: money,
  balances: z.array(z.object({ userId: z.string(), balance: money })),
  suggestions: z.array(z.object({ fromId: z.string(), toId: z.string(), amount: money })),
  totals: z.object({ expensesThisMonth: money, outstanding: money }),
  walletVersion: money,
});

export const expenseListSchema = z.array(expenseViewSchema);

/** Meta phân trang cursor của `ResponseUtils.cursor` phía BE. */
export const cursorMetaSchema = z.object({
  nextCursor: nullable(z.string()),
  hasMore: z.boolean(),
  limit: money,
});
