import type { IconName } from '@/shared/ui/icon';
import type { ThemeColorKey } from '@/shared/theme';

import type { BalanceTone } from '../domain/money';

/**
 * Bảng NGỮ NGHĨA số dư → giao diện. Màu KHÔNG bao giờ đứng một mình (trợ năng,
 * `mobile-ux.md`): mỗi tông có icon riêng + chữ "nợ"/"được nợ" ở nơi hiển thị,
 * nên người mù màu vẫn phân biệt được.
 *
 * ⚠️ Cặp `bg-surface-success` + `text-success` đo 4.45:1 (thiếu 0.05 so với AA) —
 * ngoại lệ ĐÃ KHAI ở `contrast-manifest.json`, được bù bằng cỡ ≥ 16 + semibold +
 * icon (xem `src/shared/ui/AGENTS.md`). Đừng dùng cặp này cho chữ nhỏ.
 */
export const BALANCE_TONE: Record<
  BalanceTone,
  { icon: IconName; iconColor: ThemeColorKey; surface: string; text: string }
> = {
  debt: { icon: 'arrow-up', iconColor: 'error', surface: 'bg-surface-error', text: 'text-error' },
  credit: {
    icon: 'arrow-down',
    iconColor: 'success',
    surface: 'bg-surface-success',
    text: 'text-success',
  },
  even: {
    icon: 'checkmark-circle',
    iconColor: 'fg-2',
    surface: 'bg-surface-neutral',
    text: 'text-fg-1',
  },
};
