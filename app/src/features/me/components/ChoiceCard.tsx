import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Thẻ CHỌN MỘT (icon + tiêu đề + mô tả + vòng chọn) — dáng "thẻ chọn" cho lựa chọn cần giải thích hệ quả (mức xem trước
 * trên màn hình khoá), nơi `Radio` trơn chỉ có một dòng chữ và người dùng phải đoán mỗi mức làm gì.
 *
 * ── Vì sao viết trong feature chứ không dùng `Radio`/`Chip`/`ListItem selected` ─────────────────────────────────────
 * Bộ chung chưa có "thẻ chọn" (đã tra `src/shared/ui/index.ts`): `Radio` không có ô icon/mô tả, `Chip` là viên thuốc một
 * dòng, `ListItem selected` chỉ tô nền và luôn nằm trong `Card`. Dùng ≥ 2 feature thì chuyển lên `src/shared/ui/`.
 *
 * ── Trạng thái chọn không chỉ là MÀU ─────────────────────────────────────────────────────────────────────────────
 * Viền đổi `border-border-brand` + vòng radio có chấm đặc + ô icon đổi tông `brand`/`neutral` — ba dấu hiệu, nên người
 * mù màu vẫn thấy. Nền giữ `bg-bg-1` cả hai trạng thái: ô icon tông `brand` là `surface-primary`, tô nền thẻ cùng màu đó
 * thì ô icon biến mất. Viền luôn `border-medium` (chỉ đổi MÀU) để chọn qua lại không làm thẻ nhích 0.5dp.
 *
 * ⛔ `accessibilityRole="radio"` + `selected` (vai `radio` đọc khoá `selected`, không phải `checked`); mô tả đưa vào
 * `accessibilityHint` để tên của nút vẫn là tiêu đề ngắn. Nhóm cha đặt `accessibilityRole="radiogroup"`.
 */
const choiceCard = tv(
  {
    slots: {
      pressable: 'w-full',
      root: 'w-full flex-row items-center gap-sm rounded-sm border-medium bg-bg-1 p-sm',
      texts: 'flex-1 gap-3xs',
      title: 'text-label-lg font-semibold text-fg-1',
      description: 'text-label-md text-fg-2',
      ring: 'size-6 items-center justify-center rounded-full border-medium bg-bg-1',
      dot: 'size-3 rounded-full',
    },
    variants: {
      selected: {
        true: { root: 'border-border-brand', ring: 'border-action-base', dot: 'bg-action-base' },
        false: { root: 'border-border-1', ring: 'border-border-brand-subtle' },
      },
      disabled: {
        true: {
          root: 'bg-disabled-1',
          title: 'text-action-disabled-fg',
          description: 'text-action-disabled-fg',
          ring: 'border-border-strong',
          dot: 'bg-action-disabled-fg',
        },
      },
      pressed: { true: { root: 'opacity-70' } },
    },
    defaultVariants: { disabled: false, pressed: false, selected: false },
  },
  { twMergeConfig },
);

export interface ChoiceCardProps {
  description?: string;
  disabled?: boolean;
  icon: IconName;
  onPress: () => void;
  selected: boolean;
  title: string;
}

export function ChoiceCard({
  description,
  disabled = false,
  icon,
  onPress,
  selected,
  title,
}: ChoiceCardProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      className={choiceCard().pressable()}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = choiceCard({ disabled, pressed, selected });

        return (
          <View className={styles.root()}>
            <IconTile name={icon} tone={selected && !disabled ? 'brand' : 'neutral'} />
            <View className={styles.texts()}>
              <Text className={styles.title()}>{title}</Text>
              {description ? <Text className={styles.description()}>{description}</Text> : null}
            </View>
            <View className={styles.ring()}>{selected ? <View className={styles.dot()} /> : null}</View>
          </View>
        );
      }}
    </Pressable>
  );
}
