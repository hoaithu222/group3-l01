import { View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import type { IconSize, ThemeColorKey } from '@/shared/theme';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { Icon, type IconVariant } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';

/**
 * Ô biểu tượng có TÔNG MÀU — nền `surface-*` nhạt + icon cùng họ màu. Dùng chung cho hàng danh sách, tiêu đề nhóm,
 * lối tắt phân hệ, thẻ cài đặt… để mọi nơi "có icon cho sinh động" trông như MỘT bộ, thay vì mỗi màn tự dựng một
 * ô vuông với cặp màu riêng.
 *
 * ── Vì sao chỉ có sáu tông ───────────────────────────────────────────────────
 * Mỗi tông là một CẶP token đã đo tương phản ở cả hai chế độ (`surface-*` + màu ngữ nghĩa tương ứng): sáng lẫn
 * tối đều đọc được. ⛔ Đừng thêm prop `color` tự do — cặp màu tự chọn là thứ đầu tiên hỏng ở chế độ tối.
 * Tông không mang nghĩa trạng thái (chỉ để phân biệt các phân hệ cho sinh động) thì cứ xoay vòng `brand` · `info` ·
 * `success` · `warning` · `accent`; `danger` chỉ dành cho việc phá huỷ/cảnh báo (đăng xuất, xoá, lỗi).
 *
 * ── Cỡ ───────────────────────────────────────────────────────────────────────
 * `sm` 32 (icon 20) · `md` 40 (icon 24) · `lg` 48 (icon 32) · `xl` 64 (icon 32, bo tròn hơn) — cùng bậc `size-*`
 * của thang giãn cách. Bo `rounded-sm` (16) là cấp "chip · viên thuốc" của `screen-layout.md`.
 *
 * ⚠️ Ô này là TRANG TRÍ (icon không nhãn ⇒ bị ẩn khỏi trình đọc màn hình); nhãn nằm ở chữ đứng cạnh. Nếu ô là
 * nút bấm thì bọc `Pressable` có `accessibilityLabel` bên ngoài, đừng gắn `label` vào đây.
 */
export const iconTile = tv(
  {
    slots: {
      root: 'items-center justify-center',
    },
    variants: {
      tone: {
        brand: { root: 'bg-surface-primary' },
        info: { root: 'bg-surface-info' },
        success: { root: 'bg-surface-success' },
        warning: { root: 'bg-surface-warning' },
        accent: { root: 'bg-surface-secondary' },
        danger: { root: 'bg-surface-error' },
        neutral: { root: 'bg-surface-neutral' },
      },
      size: {
        sm: { root: 'size-3xl rounded-xs' },
        md: { root: 'size-4xl rounded-sm' },
        lg: { root: 'size-5xl rounded-sm' },
        xl: { root: 'size-6xl rounded-md' },
      },
    },
    defaultVariants: { tone: 'brand', size: 'md' },
  },
  { twMergeConfig },
);

export type IconTileTone = NonNullable<VariantProps<typeof iconTile>['tone']>;
export type IconTileSize = NonNullable<VariantProps<typeof iconTile>['size']>;

/** Màu icon theo tông — cặp với nền `surface-*` ở trên. */
const TONE_INK: Record<IconTileTone, ThemeColorKey> = {
  brand: 'fg-brand',
  info: 'info',
  success: 'success',
  warning: 'warning',
  accent: 'action-accent',
  danger: 'error',
  neutral: 'fg-2',
};

const GLYPH_SIZE: Record<IconTileSize, IconSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
};

export interface IconTileProps {
  name: IconName;
  className?: string;
  size?: IconTileSize;
  tone?: IconTileTone;
  /** Mặc định `twotone` — đọc rõ hơn nét mảnh trên nền tint; icon chưa đủ hai tông tự rơi về `linear`. */
  variant?: IconVariant;
}

export function IconTile({
  className,
  name,
  size = 'md',
  tone = 'brand',
  variant = 'twotone',
}: IconTileProps) {
  const styles = iconTile({ size, tone });
  return (
    <View className={styles.root({ className })}>
      <Icon color={TONE_INK[tone]} name={name} size={GLYPH_SIZE[size]} variant={variant} />
    </View>
  );
}
