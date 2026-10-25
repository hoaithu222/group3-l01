import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

export type MetaTagTone = 'brand' | 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export interface MetaTagProps {
  /**
   * ⚠️ Bỏ trống chỉ hợp lệ với tone `neutral`/`info`/`brand` — `warning`/`success` LUÔN cần icon (xem cảnh báo tương
   * phản màu ở dưới), đừng bỏ icon cho hai tông đó.
   */
  icon?: IconName;
  label: string;
  tone?: MetaTagTone;
}

/** Màu icon phải là TOKEN (prop `color` của `Icon` không nhận class) — cặp với màu chữ ở `metaTag` bên dưới. */
const ICON_COLOR: Record<MetaTagTone, ThemeColorKey> = {
  brand: 'fg-brand',
  danger: 'error',
  info: 'info',
  neutral: 'fg-2',
  success: 'success',
  warning: 'warning',
};

/**
 * ⚠️ `warning`/`success` ở chữ nhỏ đứng dưới ngưỡng 4.5:1 trên nền trắng (4.06 / 4.45 — hai ngoại lệ đã khai trong
 * `contrast-manifest.json`). Bù ĐÚNG cách `src/shared/ui/AGENTS.md` chốt: `font-semibold` + LUÔN có icon đi kèm, để màu
 * không phải dấu hiệu duy nhất — nên hai tông này tự đậm, nơi gọi không phải nhớ.
 */
const metaTag = tv(
  {
    slots: { label: 'shrink text-caption-lg', root: 'flex-row items-center gap-2xs' },
    variants: {
      tone: {
        brand: { label: 'font-semibold text-fg-brand' },
        danger: { label: 'font-semibold text-error' },
        info: { label: 'text-info' },
        neutral: { label: 'text-fg-2' },
        success: { label: 'font-semibold text-success' },
        warning: { label: 'font-semibold text-warning' },
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
  { twMergeConfig },
);

/**
 * Một mẩu thông tin phụ "icon + chữ" của lộ trình: ngày dự kiến, thời lượng, "Trễ 2 buổi", "Đúng tiến độ".
 *
 * ⚠️ Không dùng `Badge`: huy hiệu có nền/viền và cao cứng 24dp — năm mẩu như vậy trên một dòng buổi học biến thành
 * một dải viên thuốc, lấn cả tiêu đề. Đây là chữ phụ, không phải nhãn trạng thái. Icon là trang trí (chữ đã nói đủ).
 */
export function MetaTag({ icon, label, tone = 'neutral' }: MetaTagProps) {
  const styles = metaTag({ tone });
  return (
    <View className={styles.root()}>
      {icon ? <Icon color={ICON_COLOR[tone]} name={icon} size="xs" /> : null}
      <Text className={styles.label()}>{label}</Text>
    </View>
  );
}
