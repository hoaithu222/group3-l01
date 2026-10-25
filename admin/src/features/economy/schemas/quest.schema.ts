import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { CODE_PATTERN, COIN_LIMITS } from '../constants/economy.constants';
import { reasonField } from './adjust.schema';

/**
 * Form tạo/sửa nhiệm vụ ngày — khớp `createQuestSchema`/`updateQuestSchema` BE: mã a-z0-9- (2–40), tiêu đề 2–80, mô tả 2–300,
 * `metric` thuộc danh sách cố định (đếm từ XP thật), mục tiêu 1–100, xu 1–1 000, thứ tự 0–1 000, lý do 10–500.
 */
export const questFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã tối thiểu 2 ký tự')
    .max(COIN_LIMITS.shopCodeMax, `Mã tối đa ${COIN_LIMITS.shopCodeMax} ký tự`)
    .regex(CODE_PATTERN, 'Mã chỉ gồm chữ thường, số và dấu gạch ngang'),
  title: requiredText('Tiêu đề là bắt buộc')
    .min(2, 'Tiêu đề tối thiểu 2 ký tự')
    .max(COIN_LIMITS.questTitleMax, `Tiêu đề tối đa ${COIN_LIMITS.questTitleMax} ký tự`),
  description: requiredText('Mô tả là bắt buộc')
    .min(2, 'Mô tả tối thiểu 2 ký tự')
    .max(COIN_LIMITS.questDescriptionMax, `Mô tả tối đa ${COIN_LIMITS.questDescriptionMax} ký tự`),
  metric: z.enum([
    'tasksDone',
    'tasksOnTime',
    'quizzesTaken',
    'quizzesPassed',
    'srReviewDays',
    'reviewsGiven',
    'setsPublished',
    'pomodoroCycles',
  ]),
  target: z
    .number({ error: 'Nhập mục tiêu' })
    .int('Mục tiêu phải là số nguyên')
    .min(1, 'Mục tiêu tối thiểu 1')
    .max(COIN_LIMITS.questTargetMax, `Mục tiêu tối đa ${COIN_LIMITS.questTargetMax}`),
  coins: z
    .number({ error: 'Nhập số xu thưởng' })
    .int('Số xu phải là số nguyên')
    .min(1, 'Thưởng tối thiểu 1 xu')
    .max(COIN_LIMITS.questCoinsMax, `Thưởng tối đa ${COIN_LIMITS.questCoinsMax} xu`),
  order: z
    .number({ error: 'Nhập thứ tự' })
    .int('Thứ tự phải là số nguyên')
    .min(0, 'Thứ tự ≥ 0')
    .max(COIN_LIMITS.questOrderMax, `Thứ tự ≤ ${COIN_LIMITS.questOrderMax}`),
  isActive: z.boolean(),
  reason: reasonField,
});

export type QuestFormValues = z.infer<typeof questFormSchema>;
