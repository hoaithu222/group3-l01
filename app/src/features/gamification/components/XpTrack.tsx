import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

export interface XpTrackProps {
  /** Câu ĐẦY ĐỦ cho trình đọc màn hình ("Cấp 12, còn 450 XP để lên cấp 13") — thanh chỉ là hình. */
  accessibilityLabel: string;
  /** 0–100; ngoài khoảng thì kẹp lại (server đổi ngưỡng giữa chừng không làm thanh tràn). */
  percent: number;
  /** `sm` 6dp — thẻ Trang chủ; `md` 8dp — khối cấp màn Thành tích / hồ sơ. */
  size?: 'md' | 'sm';
}

/**
 * Thanh XP mảnh: phần đầy DÂNG từ trái lúc vào màn (nhịp `slow`, "emphasized decelerate") rồi đứng yên — ý tưởng bộ đếm
 * "digital flop" của dashboard tham chiếu, áp cho thanh thay vì con số.
 *
 * ── Vì sao animate `width: %` chứ không `scaleX` ────────────────────────────────────────────────────────────────
 * `scaleX` bóp méo hai đầu bo tròn (đầu phải thành hình bầu dục khi phần đầy còn ngắn). Thanh cao 6–8dp, một lần chạy
 * 600ms ⇒ tính lại bố cục mỗi khung là rẻ, và không cần đo bề rộng (`onLayout`) như bản `translateX`.
 *
 * ⛔ Thẻ `Animated.View` mang handle `useAnimatedStyle` nên KHÔNG mang `className` (NativeWind gộp là vứt sạch style —
 * `shared/ui/AGENTS.md`); nền + bo góc nằm ở `View` con. ⚠️ "Giảm chuyển động" ⇒ đứng sẵn ở số cuối, không dâng.
 */
export function XpTrack({ accessibilityLabel, percent, size = 'md' }: XpTrackProps) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, percent));
  const fill = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    fill.set(
      reduceMotion
        ? clamped
        : withTiming(clamped, {
            duration: MOTION_DURATION.slow,
            easing: MOTION_EASING.emphasizedDecelerate,
          }),
    );
  }, [clamped, fill, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    height: '100%',
    width: `${fill.get()}%` as const,
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(clamped) }}
      className={cn('overflow-hidden rounded-full bg-bg-3', size === 'sm' ? 'h-1.5' : 'h-2')}
    >
      {/* `cssInterop={false}`: như `PressableScale` — thẻ chỉ mang handle, không để lớp interop của NativeWind chen vào. */}
      <Animated.View cssInterop={false} style={fillStyle}>
        <View className="flex-1 rounded-full bg-action-base" />
      </Animated.View>
    </View>
  );
}
