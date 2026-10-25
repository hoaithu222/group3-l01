import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { SKILL_LIMITS as L } from '../constants/skill.constants';
import { parseLabels } from '../utils/skill-labels';

/**
 * Form tạo/sửa kỹ năng — khớp `createSkillSchema`/`updateSkillSchema` BE (`be/src/modules/career/dtos/skill.dto.ts`) và `skillCriteriaSchema`
 * (`be/src/shared/criteria/skill-criteria.ts`): mã `^[a-z0-9-]{2,40}$`, tên 2–60, mô tả ≤ 300, 1–10 nhãn (≤ 40 ký tự, phải còn chữ/số sau chuẩn hoá),
 * số task 1–500, story points 0–5000 (bước 0,5), điểm review 0–10 (bước 0,1), thứ tự 0–1000. `0` ở hai ngưỡng tuỳ chọn = không áp dụng.
 */
export const skillFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{2,40}$/, 'Mã 2–40 ký tự a-z, 0-9, dấu gạch ngang'),
    name: requiredText('Tên là bắt buộc')
      .min(2, 'Tên tối thiểu 2 ký tự')
      .max(L.nameMax, `Tên tối đa ${L.nameMax} ký tự`),
    description: z.string().trim().max(L.descriptionMax, `Mô tả tối đa ${L.descriptionMax} ký tự`),
    category: z.enum(['FRONTEND', 'BACKEND', 'MOBILE', 'DATA', 'DESIGN', 'DEVOPS', 'QA', 'SOFT']),
    labels: requiredText('Cần ít nhất một nhãn khớp'),
    requiredTasksDone: z
      .number({ error: 'Nhập số task' })
      .int('Số task phải là số nguyên')
      .min(1, 'Ít nhất 1 task')
      .max(L.requiredTasksDoneMax, `Tối đa ${L.requiredTasksDoneMax} task`),
    minStoryPoints: z
      .number({ error: 'Nhập số điểm' })
      .min(0, 'Không âm')
      .max(L.minStoryPointsMax, `Tối đa ${L.minStoryPointsMax}`),
    minAvgPeerScore: z
      .number({ error: 'Nhập điểm' })
      .min(0, 'Không âm')
      .max(L.peerScoreMax, `Tối đa ${L.peerScoreMax}`),
    requireReview: z.boolean(),
    icon: z.string().trim().min(1, 'Chọn icon'),
    order: z
      .number({ error: 'Nhập thứ tự' })
      .int('Thứ tự phải là số nguyên')
      .min(0, 'Thứ tự ≥ 0')
      .max(L.orderMax, `Thứ tự ≤ ${L.orderMax}`),
    reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự'),
  })
  .superRefine((v, ctx) => {
    const labels = parseLabels(v.labels);
    if (labels.raw.length > L.labelMatchMax)
      ctx.addIssue({ code: 'custom', path: ['labels'], message: `Tối đa ${L.labelMatchMax} nhãn` });
    if (labels.raw.some((l) => l.length > L.labelMax))
      ctx.addIssue({
        code: 'custom',
        path: ['labels'],
        message: `Mỗi nhãn tối đa ${L.labelMax} ký tự`,
      });
    if (labels.invalid.length > 0)
      ctx.addIssue({
        code: 'custom',
        path: ['labels'],
        message: `Nhãn không có chữ/số: ${labels.invalid.join(', ')}`,
      });
    if (v.reason && v.reason.length < 10)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Lý do tối thiểu 10 ký tự' });
  });

export type SkillFormValues = z.infer<typeof skillFormSchema>;
