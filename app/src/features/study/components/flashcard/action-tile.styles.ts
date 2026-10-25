import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `ActionTile` — ô chấm có TÔNG MÀU (Học thẻ: "Chưa thuộc/Đã thuộc"; Ôn theo lịch: Quên/Khó/Vừa/Dễ).
 *
 * Bốn tông = bốn ngữ nghĩa quen thuộc (`error` quên · `warning` khó/chưa thuộc · `success` vừa/đã thuộc · `info` dễ), mỗi tông
 * có hai dáng:
 *  · `solid` — nền ĐẶC `action-*` + chữ CÙNG CẶP `action-*-fg` (cặp đã đo ở `Button`; ⛔ ghép chéo là mất phần tương phản);
 *  · nhạt   — nền `surface-*` + viền `-subtle` + chữ `fg-1`/`fg-2` (≥ 4.9:1 ở cả hai chế độ — ⛔ KHÔNG dùng màu ngữ nghĩa làm
 *    màu chữ ở dáng này: `warning` trên `surface-warning` chỉ 3.61:1; màu đi vào ICON, chữ vẫn `fg-1`).
 *
 * ⚠️ Số dòng tối đa của nhãn do nơi dùng khoá (`numberOfLines`) — ô có chiều cao SÀN chứ không cứng, cỡ chữ hệ thống phóng 2× thì
 * ô cao thêm (`min-h-*`), không cắt chữ.
 */
export const actionTile = tv(
  {
    slots: {
      root: 'items-center justify-center gap-3xs rounded-sm border-hairline px-xs py-xs',
      label: 'text-center text-label-md font-semibold',
      hint: 'text-center text-caption-sm',
    },
    variants: {
      tone: { error: {}, info: {}, success: {}, warning: {} },
      solid: { true: {}, false: {} },
      /** `min-h-12` (48) khi chỉ có nhãn, `min-h-14` (56) khi có thêm dòng gợi ý. */
      tall: { true: { root: 'min-h-14' }, false: { root: 'min-h-12' } },
      pressed: { true: { root: 'opacity-80' }, false: {} },
      disabled: { true: { root: 'opacity-50' }, false: {} },
    },
    compoundVariants: [
      {
        tone: 'error',
        solid: false,
        class: {
          root: 'border-border-error-subtle bg-surface-error',
          label: 'text-fg-1',
          hint: 'text-fg-2',
        },
      },
      {
        tone: 'error',
        solid: true,
        class: {
          root: 'border-border-error bg-action-error',
          label: 'text-action-error-fg',
          hint: 'text-action-error-fg',
        },
      },
      {
        tone: 'warning',
        solid: false,
        class: {
          root: 'border-border-warning-subtle bg-surface-warning',
          label: 'text-fg-1',
          hint: 'text-fg-2',
        },
      },
      {
        tone: 'warning',
        solid: true,
        class: {
          root: 'border-border-warning bg-action-warning',
          label: 'text-action-warning-fg',
          hint: 'text-action-warning-fg',
        },
      },
      {
        tone: 'success',
        solid: false,
        class: {
          root: 'border-border-success-subtle bg-surface-success',
          label: 'text-fg-1',
          hint: 'text-fg-2',
        },
      },
      {
        tone: 'success',
        solid: true,
        class: {
          root: 'border-border-success bg-action-success',
          label: 'text-action-success-fg',
          hint: 'text-action-success-fg',
        },
      },
      {
        tone: 'info',
        solid: false,
        class: {
          root: 'border-border-info-subtle bg-surface-info',
          label: 'text-fg-1',
          hint: 'text-fg-2',
        },
      },
      {
        tone: 'info',
        solid: true,
        class: {
          root: 'border-border-info bg-action-info',
          label: 'text-action-info-fg',
          hint: 'text-action-info-fg',
        },
      },
    ],
    defaultVariants: { disabled: false, pressed: false, solid: false, tall: false, tone: 'success' },
  },
  { twMergeConfig },
);

export type ActionTileTone = NonNullable<VariantProps<typeof actionTile>['tone']>;
