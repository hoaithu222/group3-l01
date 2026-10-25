import { z } from 'zod';

import type { ExpenseCategory } from '../api/wallet.types';
import { EXPENSE_CATEGORIES, WALLET_LIMITS } from '../constants/wallet.constants';
import { draftToParticipants, type SplitDraft } from '../domain/split-draft';
import { describeSplitProblem } from '../domain/split-message';
import { previewSplit } from '../domain/split-preview';
import { formatMoney } from '../domain/money';

/**
 * Schema Zod của FORM (khác `wallet.schemas.ts` là schema PHẢN HỒI). Mọi chuỗi có
 * `.trim()` — bàn phím di động tự chèn dấu cách sau gợi ý (`form-validation.md`).
 */

const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((item) => item.value) as [
  ExpenseCategory,
  ...ExpenseCategory[],
];

/**
 * `null` = ô trống. Dùng `transform` để ĐẦU RA là `number` (không phải `number | null`)
 * — nơi gửi API khỏi phải ép kiểu — và để "trống" báo cùng câu với "bằng 0".
 */
function requiredMoney(max: number, emptyMessage: string) {
  return z
    .number()
    .int()
    .max(max, `Tối đa ${formatMoney(max)}`)
    .nullable()
    .transform((value, ctx) => {
      if (value === null || value < 1) {
        ctx.addIssue({ code: 'custom', message: emptyMessage });
        return z.NEVER;
      }
      return value;
    });
}

export const expenseFormSchema = z
  .object({
    amount: requiredMoney(WALLET_LIMITS.expenseMax, 'Nhập số tiền lớn hơn 0'),
    description: z
      .string()
      .trim()
      .min(1, 'Nhập mô tả khoản chi')
      .max(WALLET_LIMITS.descriptionMax, `Tối đa ${WALLET_LIMITS.descriptionMax} ký tự`),
    category: z.enum(CATEGORY_VALUES),
    paidBy: z.string().min(1, 'Chọn người trả'),
    occurredAt: z.date(),
    split: z.custom<SplitDraft>(),
  })
  .superRefine((values, ctx) => {
    // Cùng hàm với bản xem trước của `SplitEditor` và với BE (`splitExpense`): lỗi tổng chia
    // bắt Ở ĐÂY trước khi tới BE, và câu chữ y hệt dòng tóm tắt người dùng đang thấy.
    const preview = previewSplit({
      amount: values.amount,
      paidBy: values.paidBy,
      participants: draftToParticipants(values.split),
      splitType: values.split.splitType,
    });
    if (preview.problem)
      ctx.addIssue({
        code: 'custom',
        message: describeSplitProblem(preview.problem),
        path: ['split'],
      });
  });

export type ExpenseFormInput = z.input<typeof expenseFormSchema>;
export type ExpenseFormValues = z.output<typeof expenseFormSchema>;

/** Số tiền trả nợ: phần TRẦN theo khoản nợ thật do màn Trả nợ kiểm (nó biết số nợ hiện tại). */
export const settleFormSchema = z.object({
  amount: requiredMoney(WALLET_LIMITS.expenseMax, 'Nhập số tiền lớn hơn 0'),
  method: z.enum(['BANK', 'CASH', 'OTHER']),
  note: z
    .string()
    .trim()
    .max(WALLET_LIMITS.settlementNoteMax, `Tối đa ${WALLET_LIMITS.settlementNoteMax} ký tự`),
});

export type SettleFormInput = z.input<typeof settleFormSchema>;
export type SettleFormValues = z.output<typeof settleFormSchema>;

export const paymentProfileFormSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/, 'Chọn ngân hàng hoặc nhập mã BIN gồm 6 chữ số'),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,19}$/, 'Số tài khoản gồm 6–19 chữ số'),
  accountName: z.string().trim().min(2, 'Nhập tên chủ tài khoản').max(50, 'Tối đa 50 ký tự'),
  isDefault: z.boolean(),
});

export type PaymentProfileFormValues = z.infer<typeof paymentProfileFormSchema>;

export const walletSettingsFormSchema = z
  .object({
    reminderEnabled: z.boolean(),
    weekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    timezone: z.string().trim().min(1, 'Chọn múi giờ'),
    reminderTargetType: z.enum(['NONE', 'CONVERSATION', 'CHANNEL']),
    reminderTargetId: z.string().nullable(),
    reminderMinDebt: z
      .number()
      .int()
      .min(0)
      .max(
        WALLET_LIMITS.reminderMinDebtMax,
        `Tối đa ${formatMoney(WALLET_LIMITS.reminderMinDebtMax)}`,
      ),
  })
  .superRefine((values, ctx) => {
    // BE (`walletSettingsSchema`) từ chối cả hai chiều: có đích mà thiếu id, hoặc "Không" mà còn id.
    if (values.reminderTargetType !== 'NONE' && !values.reminderTargetId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Chọn nơi đăng nhắc nợ',
        path: ['reminderTargetId'],
      });
    }
  });

export type WalletSettingsFormValues = z.infer<typeof walletSettingsFormSchema>;
