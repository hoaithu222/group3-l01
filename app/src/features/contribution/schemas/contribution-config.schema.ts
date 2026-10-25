import { z } from 'zod';

import type { ContributionConfig } from '../api/contribution.types';

export const WEIGHT_TOTAL = 100;
export const GRACE_HOURS_MAX = 72;
export const UNESTIMATED_MAX = 13;
export const UNESTIMATED_STEP = 0.5;

const weight = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${label}`)
    .regex(/^\d{1,3}$/, `${label} là số nguyên từ 0 đến ${WEIGHT_TOTAL}`)
    .transform(Number)
    .pipe(z.number().min(0, 'Tối thiểu 0').max(WEIGHT_TOTAL, `Tối đa ${WEIGHT_TOTAL}`));

/** Bàn phím tiếng Việt có thể ra dấu PHẨY thập phân ("0,5") — chấp nhận cả hai dấu, quy về dấu chấm trước khi đổi số. */
const decimal = z
  .string()
  .trim()
  .min(1, 'Nhập điểm cho thẻ chưa gán')
  .regex(/^\d{1,2}([.,]\d)?$/, 'Nhập số như 1 hoặc 0,5')
  .transform((text) => Number(text.replace(',', '.')))
  .pipe(
    z
      .number()
      .min(0, 'Tối thiểu 0')
      .max(UNESTIMATED_MAX, `Tối đa ${UNESTIMATED_MAX}`)
      .refine((value) => Number.isInteger(value / UNESTIMATED_STEP), 'Điểm phải là bội của 0,5'),
  );

/**
 * Form "Đổi trọng số" (app.md §3): ba trọng số nguyên 0–100 có TỔNG đúng 100, số giờ cho phép trễ 0–72, điểm tính cho thẻ chưa gán story
 * points 0–13 (bội của 0,5) — GIỐNG schema `putContributionConfigSchema` phía BE. Ô là chuỗi (`TextInput`), Zod đổi sang số ở đầu ra.
 *
 * Lỗi "tổng ≠ 100" KHÔNG gắn vào ô nào: dòng tổng ở giao diện tự tính lại theo từng ký tự gõ (`weightsTotal`) nên không phụ thuộc bộ nhớ lỗi
 * của react-hook-form; schema vẫn chặn `handleSubmit` như lớp bảo hiểm.
 */
export const contributionConfigSchema = z
  .object({
    graceHours: z
      .string()
      .trim()
      .min(1, 'Nhập số giờ')
      .regex(/^\d{1,2}$/, `Số giờ là số nguyên từ 0 đến ${GRACE_HOURS_MAX}`)
      .transform(Number)
      .pipe(z.number().min(0, 'Tối thiểu 0').max(GRACE_HOURS_MAX, `Tối đa ${GRACE_HOURS_MAX}`)),
    onTime: weight('trọng số đúng hạn'),
    peer: weight('trọng số điểm chấm'),
    points: weight('trọng số điểm thẻ'),
    unestimated: decimal,
  })
  .refine((values) => values.points + values.onTime + values.peer === WEIGHT_TOTAL, {
    message: `Tổng trọng số phải bằng ${WEIGHT_TOTAL}`,
    // Không thuộc ô nào (đặt vào `points` thì thông báo hiện dưới ô đó VÀ ở dòng tổng — hai chỗ cho một lỗi).
    path: ['total'],
  });

export type ContributionConfigInput = z.input<typeof contributionConfigSchema>;
export type ContributionConfigValues = z.output<typeof contributionConfigSchema>;

/** Giá trị ban đầu của form từ công thức hiện hành — số → chuỗi (số thập phân kiểu Việt: "0,5"). */
export function toConfigInput(config: ContributionConfig): ContributionConfigInput {
  return {
    graceHours: String(config.onTimeGraceHours),
    onTime: String(config.weights.onTime),
    peer: String(config.weights.peer),
    points: String(config.weights.points),
    unestimated: String(config.unestimatedPoints).replace('.', ','),
  };
}

/** Tổng ba trọng số từ giá trị đang gõ; ô trống/không phải số tính là 0 để dòng tổng cập nhật ngay cả khi gõ dở. */
export function weightsTotal(values: Partial<Pick<ContributionConfigInput, 'onTime' | 'peer' | 'points'>>): number {
  const part = (text: string | undefined): number => {
    const value = Number((text ?? '').trim());
    return Number.isFinite(value) ? value : 0;
  };
  return part(values.points) + part(values.onTime) + part(values.peer);
}
