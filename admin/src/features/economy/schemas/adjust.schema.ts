import { z } from 'zod';

import { formatNumber } from '@/shared/utils/format';
import { requiredText } from '@/shared/utils/validation/validators.utils';

import { COIN_LIMITS } from '../constants/economy.constants';

/** Lý do (10–500 ký tự) — khớp `reasonSchema` BE; dùng chung cho mọi form ghi của kinh tế xu. */
export const reasonField = requiredText('Lý do là bắt buộc')
  .min(10, 'Lý do tối thiểu 10 ký tự')
  .max(500, 'Lý do tối đa 500 ký tự');

/**
 * Form điều chỉnh ví — khớp `adjustSchema` BE (`amount` nguyên ≠ 0, |amount| ≤ `adjustMax`, lý do 10–500).
 * `balance` = số dư đang hiển thị: chặn TRƯỚC khi gửi việc trừ quá số dư (BE vẫn là chỗ quyết định — `COIN_001`, kể cả khi số dư vừa đổi).
 * Từ `adjustLargeConfirm` xu trở lên bắt tích ô xác nhận — một chốt chặn chống nhập nhầm số 0 thừa, không thay cho kiểm quyền.
 */
export const buildAdjustSchema = (balance: number | null) =>
  z
    .object({
      amount: z
        .number({ error: 'Nhập số xu' })
        .int('Số xu phải là số nguyên')
        .refine((v) => v !== 0, 'Số xu điều chỉnh phải khác 0')
        .refine(
          (v) => Math.abs(v) <= COIN_LIMITS.adjustMax,
          `Tối đa ±${formatNumber(COIN_LIMITS.adjustMax)} xu mỗi lần`,
        ),
      reason: reasonField,
      confirmLarge: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (balance !== null && v.amount < 0 && -v.amount > balance) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: `Không thể trừ quá số dư hiện tại (${formatNumber(balance)} xu)`,
        });
      }
      if (Math.abs(v.amount) >= COIN_LIMITS.adjustLargeConfirm && !v.confirmLarge) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmLarge'],
          message: 'Hãy tích xác nhận đây là điều chỉnh lớn',
        });
      }
    });

export type AdjustFormValues = z.infer<ReturnType<typeof buildAdjustSchema>>;

/** Giá trị ban đầu của form điều chỉnh — số xu để trống (không đoán hộ), chưa tích xác nhận. */
export const ADJUST_DEFAULTS: Partial<AdjustFormValues> = {
  amount: undefined,
  reason: '',
  confirmLarge: false,
};
