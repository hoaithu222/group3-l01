import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useLoopProgress } from '@/shared/ui/effects';
import { MOTION_DURATION } from '@/shared/ui/motion';

/** Biên độ (tỉ lệ chiều cao) của từng vạch ở hai đầu nhịp — lệch pha nhau để trông như MỨC ÂM THANH, không như một khối nhấp nháy. */
const BARS = [
  { from: 0.4, to: 1 },
  { from: 1, to: 0.35 },
  { from: 0.55, to: 0.9 },
] as const;

function Bar({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const { from, to } = BARS[index] ?? BARS[0];
  // ⛔ Thẻ mang `useAnimatedStyle` KHÔNG mang `className` — màu/bo góc nằm ở `View` con (`shared/ui/AGENTS.md` "Chuyển động").
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: from + (to - from) * progress.get() }],
  }));

  return (
    <Animated.View cssInterop={false} style={style}>
      <View className="h-3 w-1 rounded-full bg-action-success-fg" />
    </Animated.View>
  );
}

/**
 * Ba vạch "đang nói" trong chip xanh của ô — dấu hiệu bằng HÌNH (không chỉ màu viền) cho người đang nói, kiểu chỉ báo âm thanh của Meet.
 *
 * ✅ Chỉ được gắn khi người đó ĐANG nói (cha render có điều kiện) ⇒ không có vòng lặp nào chạy trên sân khấu khi im lặng; tháo ra là
 * `useLoopProgress` tự huỷ. "Giảm chuyển động" bật (hoặc chạy trong Jest) ⇒ ba vạch ĐỨNG YÊN ở giữa nhịp — vẫn đọc ra "đang nói".
 * Đây là tín hiệu CHỨC NĂNG, không phải trang trí (brief: trong phòng họp không có vòng lặp trang trí). Ẩn khỏi trình đọc màn hình:
 * nghĩa "Đang nói" nằm ở nhãn của ô.
 */
export function SpeakingBars() {
  const progress = useLoopProgress({
    active: true,
    duration: MOTION_DURATION.slow,
    reverse: true,
    still: 0.5,
  });

  return (
    <View
      accessibilityElementsHidden
      className="h-4 flex-row items-center gap-0.5"
      importantForAccessibility="no-hide-descendants"
      testID="speaking-bars"
    >
      {BARS.map((_bar, index) => (
        <Bar key={index} index={index} progress={progress} />
      ))}
    </View>
  );
}
