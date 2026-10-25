import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `AnswerCard` — thẻ đáp án của Quiz nhanh.
 *
 * ── Sáu trạng thái, đọc được KHÔNG cần màu ───────────────────────────────────
 * Trước khi chấm: `idle` (viền mảnh, ô chọn RỖNG bên phải) · `selected` (viền dày tông thương hiệu + dấu tích). Sau khi chấm: `correct` (chọn đúng) ·
 * `wrong` (chọn sai) · `missed` (đáp án đúng mà bị bỏ sót) · `muted` (phần còn lại, mờ đi). Mỗi trạng thái sau khi chấm còn có CHỮ ("Đúng", "Sai",
 * "Đáp án đúng") và icon riêng ở `AnswerCard` — màu chỉ nhấn thêm (`mobile-ux.md`: màu không phải kênh thông tin duy nhất).
 *
 * ⚠️ Cặp `surface-*` + chữ `fg-1`/`fg-2` là cặp đã đo ≥ 4.9:1 ở cả hai chế độ; nền ĐẶC `action-*` chỉ dùng cho ô chữ cái A/B/C và luôn đi với chữ
 * `action-*-fg` CÙNG cặp (`ui-component` §3: ghép chéo là mất phần tương phản đã đo).
 * ⛔ Cao tối thiểu 56dp (`min-h-14`): thẻ là đích chạm chính của cả màn — câu dài thì tự cao thêm, không cắt.
 */
export const answerCard = tv(
  {
    slots: {
      root: 'min-h-14 flex-row items-center gap-sm rounded-md border-medium px-md py-sm',
      marker: 'size-9 items-center justify-center rounded-full',
      letter: 'text-label-md font-semibold',
      text: 'text-body-lg',
      caption: 'text-caption-lg font-semibold text-fg-2',
      box: 'size-6 items-center justify-center border-medium',
    },
    variants: {
      state: {
        idle: {
          root: 'border-border-1 bg-bg-1',
          marker: 'border-hairline border-border-2 bg-bg-3',
          letter: 'text-fg-2',
          text: 'text-fg-1',
          box: 'border-border-strong',
        },
        selected: {
          root: 'border-border-brand bg-surface-primary',
          marker: 'bg-action-base',
          letter: 'text-action-fg',
          text: 'font-semibold text-fg-1',
          box: 'border-transparent',
        },
        correct: {
          root: 'border-border-success bg-surface-success',
          marker: 'bg-action-success',
          letter: 'text-action-success-fg',
          text: 'font-semibold text-fg-1',
          box: 'border-transparent',
        },
        wrong: {
          root: 'border-border-error bg-surface-error',
          marker: 'bg-action-error',
          letter: 'text-action-error-fg',
          text: 'font-semibold text-fg-1',
          box: 'border-transparent',
        },
        missed: {
          root: 'border-border-success-subtle bg-surface-success',
          marker: 'bg-action-success',
          letter: 'text-action-success-fg',
          text: 'text-fg-1',
          box: 'border-transparent',
        },
        muted: {
          root: 'border-border-1 bg-bg-1',
          marker: 'border-hairline border-border-2 bg-bg-3',
          letter: 'text-fg-2',
          text: 'text-fg-2',
          box: 'border-border-1',
        },
      },
      multi: { true: { box: 'rounded-3xs' }, false: { box: 'rounded-full' } },
      pressed: { true: { root: 'bg-surface-primary' } },
    },
    defaultVariants: { multi: false, pressed: false, state: 'idle' },
  },
  { twMergeConfig },
);
