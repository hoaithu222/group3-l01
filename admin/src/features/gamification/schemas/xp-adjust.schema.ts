import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

/** Biên điều chỉnh XP một lần (BE `adjustMaxAbs`, vượt → `GAME_004`). */
export const XP_ADJUST_MAX_ABS = 1000;

/** Khớp `xpAdjustSchema` BE: `delta` nguyên khác 0, `reason` 10–500. */
export const xpAdjustSchema = z.object({
  delta: z
    .number({ error: 'Nhập số XP' })
    .int('XP phải là số nguyên')
    .min(-XP_ADJUST_MAX_ABS, `Tối đa ±${XP_ADJUST_MAX_ABS} XP mỗi lần`)
    .max(XP_ADJUST_MAX_ABS, `Tối đa ±${XP_ADJUST_MAX_ABS} XP mỗi lần`)
    .refine((v) => v !== 0, 'XP điều chỉnh phải khác 0'),
  reason: requiredText('Lý do là bắt buộc')
    .min(10, 'Lý do tối thiểu 10 ký tự')
    .max(500, 'Lý do tối đa 500 ký tự'),
});
export type XpAdjustFormValues = z.infer<typeof xpAdjustSchema>;
