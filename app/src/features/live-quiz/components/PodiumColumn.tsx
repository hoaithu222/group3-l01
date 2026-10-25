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

import { Badge } from '@/shared/ui/badge';
import { formatNumber } from '@/shared/utils/format/currency.utils';
import { cn } from '@/shared/utils/style/cn';

import { MEDALS, PODIUM_HEIGHT } from '../constants/live-quiz-visuals';
import type { RankedEntry } from '../utils/ranked-entries';
import { DecorAvatar } from './DecorAvatar';

const RISE_MS = 520;
/** Cột thứ 3 mọc trước, cột nhất mọc sau cùng — khoảnh khắc "ai đứng đầu" đến cuối. */
const DELAY_MS: Record<1 | 2 | 3, number> = { 1: 360, 2: 180, 3: 0 };

export interface PodiumColumnProps {
  entry: RankedEntry;
  me: boolean;
  /** Vị trí trên bục (1 = giữa, cao nhất) — khác `entry.rank` khi đồng hạng. */
  position: 1 | 2 | 3;
}

/**
 * Một cột của bục nhận giải: avatar + tên + điểm ở trên, cột màu vàng/bạc/đồng có số hạng ở dưới. Cột MỌC LÊN (chiều cao trượt trên
 * luồng UI, trễ lần lượt 3 → 2 → 1); "Giảm chuyển động" ⇒ đứng sẵn ở chiều cao cuối. Số hạng in trên cột là hạng THẬT
 * (`entry.rank`), còn chiều cao theo vị trí. ⛔ `Animated.View` không mang `className` — phần nhìn thấy là `View` lồng trong.
 */
export function PodiumColumn({ entry, me, position }: PodiumColumnProps) {
  const reduceMotion = useReducedMotion();
  const target = PODIUM_HEIGHT[position];
  const height = useSharedValue(reduceMotion ? target : 0);
  const medal = MEDALS[Math.min(3, Math.max(1, entry.rank)) as 1 | 2 | 3];
  const score = formatNumber(entry.score);

  useEffect(() => {
    height.set(
      reduceMotion
        ? target
        : withDelay(
            DELAY_MS[position],
            withTiming(target, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }),
          ),
    );
  }, [height, position, reduceMotion, target]);

  const pillarStyle = useAnimatedStyle(() => ({ height: height.get() }));

  return (
    <View
      accessibilityLabel={`Hạng ${String(entry.rank)}, ${entry.name}${me ? ', bạn' : ''}, ${score} điểm`}
      accessible
      className="flex-1 items-center gap-2xs"
    >
      <DecorAvatar name={entry.name} size={position === 1 ? 'lg' : 'md'} />
      <Text
        className={cn('w-full text-center text-label-md text-fg-1', me && 'font-semibold')}
        numberOfLines={1}
      >
        {entry.name}
      </Text>
      <Text className="text-label-lg text-fg-1">{score}</Text>
      {me ? <Badge label="Bạn" size="sm" variant="warning" /> : null}
      <Animated.View cssInterop={false} style={[{ width: '100%' }, pillarStyle]}>
        <View className={cn('flex-1 items-center rounded-t-md pt-xs', medal.fill)}>
          <Text className={cn('text-header-md font-bold', medal.ink)} maxFontSizeMultiplier={1.3}>
            {String(entry.rank)}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
