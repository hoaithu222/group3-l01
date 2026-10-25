import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { describeNavCell, navCellState } from '../../utils/mock-nav-utils';

/**
 * Ô số câu trên lưới. Hai trục ĐỘC LẬP, mỗi trục một kênh hình khác nhau (màu không phải kênh duy nhất):
 *  · làm bài: ĐÃ TRẢ LỜI = nền `info` + viền liền + chữ đậm; BỎ TRỐNG = nền trắng + viền NÉT ĐỨT.
 *  · vị trí: ĐANG XEM = viền `info` DÀY (`border-thick`) (giữ nguyên nền của trục kia nên câu đã làm đang xem vẫn nhận ra là đã làm).
 * Phụ: ngôi sao ở góc trái = đánh dấu xem lại; chấm ở góc phải = chưa đồng bộ. Nhãn trợ năng đọc đủ mọi trạng thái.
 *
 * Vùng chạm 44dp (`size-11`) — đúng ngưỡng tối thiểu, không phóng hình.
 */
const cell = tv(
  {
    slots: {
      root: 'size-11 items-center justify-center rounded-xs border-medium',
      label: 'text-label-lg',
    },
    variants: {
      state: {
        answered: {
          root: 'border-solid border-border-info-subtle bg-surface-info',
          label: 'font-semibold text-info',
        },
        blank: { root: 'border-dashed border-border-2 bg-bg-1', label: 'text-fg-2' },
      },
      current: {
        true: { root: 'border-thick border-solid border-border-info', label: 'font-bold' },
      },
    },
    defaultVariants: { current: false, state: 'blank' },
  },
  { twMergeConfig },
);

export interface NavCellProps {
  current: boolean;
  done: boolean;
  flagged: boolean;
  /** Số câu hiển thị (1-based). */
  number: number;
  pending: boolean;
  onPress: () => void;
}

export function NavCell({ current, done, flagged, number, onPress, pending }: NavCellProps) {
  const styles = cell({ current, state: navCellState(done) });
  return (
    <Pressable
      accessibilityLabel={describeNavCell(number, { done, flagged, pending })}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      // Mờ nhẹ lúc chạm — ô 44dp nhỏ, không có phản hồi thì dễ bấm lại lần hai vì tưởng trượt.
      className="active:opacity-70"
      onPress={onPress}
    >
      <View className={styles.root()}>
        <Text className={styles.label()} maxFontSizeMultiplier={1.2}>
          {String(number)}
        </Text>
        {flagged ? (
          <View className="absolute -left-2xs -top-2xs size-4 items-center justify-center rounded-full bg-bg-1">
            <Icon color="warning" name="star" size={14} variant="solid" />
          </View>
        ) : null}
        {pending ? (
          <View className="absolute -right-3xs -top-3xs">
            <Badge dot variant="warning" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
