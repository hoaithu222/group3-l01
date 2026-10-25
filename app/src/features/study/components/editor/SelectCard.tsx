import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Thẻ CHỌN (icon + tên + mô tả một dòng) cho ba chỗ của trình soạn: chọn dạng mục, chọn phạm vi bộ, chọn Đúng/Sai.
 *
 * ── Vì sao viết trong feature chứ không dùng `Radio`/`Chip`/`ListItem` ───────────────────────────────────────────────
 * Bộ chung chưa có "thẻ chọn" (đã tra `src/shared/ui/index.ts`): `Radio` trơn chỉ có một dòng chữ, `Chip` là viên thuốc một
 * dòng không chứa mô tả, `ListItem selected` chỉ tô nền và luôn nằm trong `Card`. `features/me/components/ChoiceCard` là bản
 * cùng ý cho một feature khác — cùng khuôn (viền `border-medium` chỉ đổi MÀU để chọn qua lại không nhích thẻ, vòng radio có
 * chấm đặc). Dùng ở feature thứ ba thì chuyển lên `src/shared/ui/`.
 *
 * ── Trạng thái chọn KHÔNG chỉ là màu ─────────────────────────────────────────────────────────────────────────────────
 * Viền đổi sang `border-border-brand` + chấm đặc trong vòng chọn + ô icon đổi tông; nền giữ `bg-bg-1` (tô nền cùng họ với ô icon
 * `surface-primary` thì ô icon biến mất). `role="button"` (chọn xong là đi tiếp, như thêm mục) thì không vẽ vòng chọn.
 *
 * ⚠️ `accessibilityState` khai CẢ `checked` lẫn `selected`: TalkBack đọc `radio` theo `checked`, còn iOS theo `selected`; thiếu
 * một trong hai là một nền tảng đọc "nút" trơn mà không nói đã chọn hay chưa. Mô tả nối vào NHÃN (không phải `accessibilityHint`,
 * hint hay bị người dùng tắt) để nghe đủ "Công khai. Mọi người dùng đều tìm thấy…".
 */
const selectCard = tv(
  {
    slots: {
      pressable: 'w-full',
      root: 'w-full rounded-sm border-medium bg-bg-1 p-sm',
      body: 'gap-3xs',
      label: 'text-label-md font-semibold',
      description: 'text-caption-sm',
      ring: 'size-6 items-center justify-center rounded-full border-medium bg-bg-1',
      dot: 'size-3 rounded-full',
    },
    variants: {
      layout: {
        row: { root: 'min-h-14 flex-row items-center gap-sm', body: 'flex-1' },
        stacked: {
          root: 'min-h-32 items-center justify-center gap-xs',
          body: 'items-center',
          label: 'text-center',
          description: 'text-center',
          ring: 'absolute right-xs top-xs',
        },
      },
      selected: {
        true: { root: 'border-border-brand', ring: 'border-action-base', dot: 'bg-action-base' },
        false: { root: 'border-border-1', ring: 'border-border-brand-subtle' },
      },
      disabled: {
        true: {
          root: 'border-border-1 bg-disabled-1',
          label: 'text-action-disabled-fg',
          description: 'text-action-disabled-fg',
          ring: 'border-border-strong',
        },
        false: { label: 'text-fg-1', description: 'text-fg-2' },
      },
      pressed: { true: { root: 'opacity-70' } },
    },
    defaultVariants: { disabled: false, layout: 'row', pressed: false, selected: false },
  },
  { twMergeConfig },
);

export interface SelectCardProps {
  description?: string;
  disabled?: boolean;
  icon: IconName;
  label: string;
  /** `row`: icon trái, chữ giữa, vòng chọn phải · `stacked`: icon trên, chữ giữa, vòng chọn ở góc (lưới hai cột). */
  layout?: 'row' | 'stacked';
  onPress: () => void;
  /** `radio`: một trong nhiều, vẽ vòng chọn · `button`: chạm là đi tiếp, không có trạng thái chọn. */
  role?: 'button' | 'radio';
  selected?: boolean;
  tone?: IconTileTone;
}

export function SelectCard({
  description,
  disabled = false,
  icon,
  label,
  layout = 'row',
  onPress,
  role = 'radio',
  selected = false,
  tone = 'brand',
}: SelectCardProps) {
  const radio = role === 'radio';
  return (
    <Pressable
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityRole={role}
      accessibilityState={radio ? { checked: selected, disabled, selected } : { disabled }}
      className={selectCard().pressable()}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = selectCard({ disabled, layout, pressed, selected: radio && selected });
        return (
          <View className={styles.root()}>
            <IconTile name={icon} tone={disabled ? 'neutral' : tone} />
            <View className={styles.body()}>
              <Text className={styles.label()}>{label}</Text>
              {description ? <Text className={styles.description()}>{description}</Text> : null}
            </View>
            {radio ? (
              <View className={styles.ring()}>
                {selected && !disabled ? <View className={styles.dot()} /> : null}
              </View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}
