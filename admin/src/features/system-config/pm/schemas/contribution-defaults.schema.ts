import { z } from 'zod';

import {
  CONTRIBUTION_GRACE_HOURS_MAX,
  CONTRIBUTION_UNESTIMATED_MAX,
  CONTRIBUTION_UNESTIMATED_STEP,
  CONTRIBUTION_WEIGHT_TOTAL,
} from '../constants/pm.constants';

const weight = z
  .number({ error: 'Nhập một số' })
  .int('Nhập số nguyên')
  .min(0, 'Tối thiểu 0')
  .max(CONTRIBUTION_WEIGHT_TOTAL, `Tối đa ${CONTRIBUTION_WEIGHT_TOTAL}`);

/**
 * Schema form "Đóng góp — mặc định cho bảng mới" — GIỐNG schema `pm.contribution` phía BE
 * (`be/src/core/config/system-config.registry.ts`): ba trọng số nguyên 0–100 có TỔNG đúng 100, số giờ cho phép
 * trễ 0–72, điểm tính cho thẻ chưa gán story points 0–13 (bội của 0,5).
 *
 * Lỗi "tổng ≠ 100" gắn ở `weights` (không thuộc ô nào) — form chặn gửi; dòng tổng ở giao diện tự tính lại theo từng
 * lần gõ (`ContributionWeightsTotal`) nên không phụ thuộc bộ nhớ lỗi của react-hook-form.
 */
export const contributionDefaultsSchema = z.object({
  weights: z
    .object({ points: weight, onTime: weight, peer: weight })
    .refine(
      (w) => w.points + w.onTime + w.peer === CONTRIBUTION_WEIGHT_TOTAL,
      `Tổng trọng số phải bằng ${CONTRIBUTION_WEIGHT_TOTAL}`,
    ),
  onTimeGraceHours: z
    .number({ error: 'Nhập một số' })
    .int('Nhập số nguyên')
    .min(0, 'Tối thiểu 0')
    .max(CONTRIBUTION_GRACE_HOURS_MAX, `Tối đa ${CONTRIBUTION_GRACE_HOURS_MAX}`),
  unestimatedPoints: z
    .number({ error: 'Nhập một số' })
    .min(0, 'Tối thiểu 0')
    .max(CONTRIBUTION_UNESTIMATED_MAX, `Tối đa ${CONTRIBUTION_UNESTIMATED_MAX}`)
    .refine((v) => Number.isInteger(v / CONTRIBUTION_UNESTIMATED_STEP), 'Điểm phải là bội của 0,5'),
});

export type ContributionDefaultsFormValues = z.infer<typeof contributionDefaultsSchema>;
export type ContributionWeightsValue = ContributionDefaultsFormValues['weights'];
