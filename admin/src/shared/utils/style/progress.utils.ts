/**
 * @file progress.utils.ts
 * @description Quy đổi % hoàn thành → màu của `<Progress>` / `<ProgressCircle>`.
 *
 * Tách ra dùng chung để mọi chỗ hiện tiến độ đọc CÙNG một thang màu — mỗi màn tự
 * đặt ngưỡng riêng thì cùng một con số lại ra hai màu khác nhau.
 *
 * Import kiểu (`import type`) từ kit2 nên KHÔNG tạo phụ thuộc runtime utils → ui.
 */

import type { ProgressVariant } from '@/shared/ui';

/** Ngưỡng đổi màu — đọc từ trên xuống, khớp mức đầu tiên thì dừng. */
const THRESHOLDS: { min: number; variant: ProgressVariant }[] = [
  { min: 100, variant: 'success' },
  { min: 70, variant: 'primary' },
  { min: 30, variant: 'warning' },
];

/**
 * Màu theo mức hoàn thành: xong (100) · khá (≥ 70) · đang chạy (≥ 30) · mới bắt đầu.
 * Giá trị ngoài [0, 100] được kẹp về biên trước khi so.
 */
export function progressVariantOf(percent: number): ProgressVariant {
  const value = Math.max(0, Math.min(100, percent));
  return THRESHOLDS.find((item) => value >= item.min)?.variant ?? 'error';
}

/** Class màu CHỮ khớp màu thanh `<Progress>` theo cùng ngưỡng — để số % cùng tông với bar. */
const PROGRESS_TEXT_CLASS: Record<ProgressVariant, string> = {
  primary: 'text-primary-5',
  success: 'text-success-5',
  warning: 'text-warning-5',
  error: 'text-error-5',
  neutral: 'text-fg-2',
};

/** Màu chữ % theo mức hoàn thành — trùng màu thanh tiến trình cùng %. */
export function progressTextClassOf(percent: number): string {
  return PROGRESS_TEXT_CLASS[progressVariantOf(percent)];
}

/** Token màu (không phải class) khớp cùng ngưỡng — cho SVG/canvas không nhận class Tailwind. */
const PROGRESS_COLOR_TOKEN: Record<ProgressVariant, string> = {
  primary: 'primary-5',
  success: 'success-5',
  warning: 'warning-5',
  error: 'error-5',
  neutral: 'fg-4',
};

/**
 * Token màu theo mức hoàn thành — dùng cho vòng donut, cung SVG, gradient… những chỗ cần
 * `var(--color-…)` chứ không dùng được class.
 *
 * Cùng ngưỡng với `progressVariantOf` để vòng, thanh và số % của CÙNG một con số không bao giờ
 * ra hai màu khác nhau.
 */
export function progressColorTokenOf(percent: number): string {
  return PROGRESS_COLOR_TOKEN[progressVariantOf(percent)];
}

/*
 * ⛔ ĐÃ BỎ hai biến thể đổi bậc (`progressStrong*` bậc -6, `progressBright*` bậc -4).
 *
 * Chúng ra đời để cứu chữ % đọc không ra trên panel nổi của viewer, nhưng đó là chữa sai chỗ:
 * lỗi nằm ở NỀN panel (bậc `bg-4`, sáng nhất thang) nuốt cả thang semantic, chứ không phải
 * thang màu sai. Nền panel nổi nay hạ xuống `bg-2` (`toolPanelSurface`) và bậc `-5` chuẩn nổi
 * bình thường — mọi nơi hiển thị tiến độ lại dùng đúng một bộ màu.
 *
 * Cần đọc màu trên một mặt sáng khác thì đổi NỀN của mặt đó, đừng thêm một thang màu thứ hai.
 */
