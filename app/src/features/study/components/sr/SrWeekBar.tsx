import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/shared/utils/style/cn';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { TONE_FILL, TRACK_CLASS } from '../flashcard/study-tone.constants';

/** Cột có thẻ thì cao TỐI THIỂU chừng này % — ngày chỉ 1 thẻ giữa ngày 40 thẻ vẫn thấy được. */
const MIN_PERCENT = 10;
const GROW_MS = 450;
const STAGGER_MS = 45;
const FULL_WIDTH = { width: '100%' } as const;

export interface SrWeekBarProps {
  /** Nhãn dưới cột ("Mai", "T6"). */
  caption: string;
  count: number;
  /** Thứ tự cột — cột sau mọc trễ hơn chút để mắt đọc từ trái sang phải. */
  index: number;
  /** Nhãn đọc lên cho cả cột ("Mai, T6 28/09: 5 thẻ"). */
  label: string;
  /** Số thẻ lớn nhất trong tuần — mẫu số của chiều cao cột. */
  max: number;
  /** Cột NGÀY MAI (`dueNext7Days[0]`): nền track nhuộm nhạt + nhãn đậm để thấy ngay "mai ôn bao nhiêu". */
  highlight?: boolean;
}

/**
 * Một cột của lịch 7 ngày: SỐ thẻ bằng chữ ở trên (thông tin thật — cột chỉ là hình), cột mọc lên từ đáy, nhãn ngày ở dưới.
 * Cột mọc bằng `useAnimatedStyle` (luồng UI, không `setState`); "Giảm chuyển động" ⇒ đứng yên ở chiều cao cuối. Ngày 0 thẻ: cột rỗng
 * + số mờ (`fg-2`), không phải khoảng trống khó hiểu.
 *
 * ⛔ `Animated.View` không mang `className` — `width`/`height` nằm TRONG style hoạt hoạ, màu ở `View` lồng bên trong.
 * ⚠️ Chiều cao cột tính theo % của track (track cao cố định `h-16`, `tablet:h-24`) nên số dp thô không xuất hiện trong mã.
 */
export function SrWeekBar({
  caption,
  count,
  highlight = false,
  index,
  label,
  max,
}: SrWeekBarProps) {
  const reduceMotion = useReducedMotion();
  const target = count <= 0 ? 0 : Math.max(MIN_PERCENT, (count / Math.max(1, max)) * 100);
  const grow = useSharedValue(reduceMotion ? target : 0);

  useEffect(() => {
    grow.set(
      reduceMotion
        ? target
        : withDelay(
            index * STAGGER_MS,
            withTiming(target, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }),
          ),
    );
  }, [grow, index, reduceMotion, target]);

  const fillStyle = useAnimatedStyle(() => ({ height: `${grow.get()}%` }));

  return (
    <View accessibilityLabel={label} accessible className="flex-1 items-center gap-3xs">
      <Text className={cn('text-label-md', count > 0 ? 'text-fg-1' : 'text-fg-2')}>
        {String(count)}
      </Text>
      <View
        className={cn(
          'h-16 w-full justify-end overflow-hidden rounded-xs tablet:h-24',
          highlight ? 'bg-surface-success' : TRACK_CLASS,
        )}
      >
        <Animated.View cssInterop={false} style={[FULL_WIDTH, fillStyle]}>
          <View className={cn('flex-1', TONE_FILL[STUDY_MODE_META.sr.tone])} />
        </Animated.View>
      </View>
      <Text className={cn('text-caption-sm', highlight ? 'font-semibold text-fg-1' : 'text-fg-2')}>
        {caption}
      </Text>
    </View>
  );
}
