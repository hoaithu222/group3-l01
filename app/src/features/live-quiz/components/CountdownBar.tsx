import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { useCountdownAnnouncer } from '../hooks/useCountdownAnnouncer';
import { useQuizCountdown } from '../hooks/useQuizCountdown';
import { remainingMs } from '../utils/clock';
import {
  countdownSpeech,
  countdownTone,
  shouldAnnounce,
  type CountdownTone,
} from '../utils/countdown-tone';

interface CountdownBarProps {
  deadlineAt: number;
  offsetMs: number;
  /** Tổng số giây của câu — để tính bề rộng thanh; không biết thì lấy số giây còn lại lúc mở màn làm mốc 100%. */
  totalSeconds?: number;
}

/**
 * Màu thanh/chữ/icon theo sắc thái: thương hiệu → cam → đỏ. ⚠️ Màu KHÔNG đi một mình: chữ số đổi cỡ nhịp + icon đổi hình + nhãn chữ.
 * Ba bảng RIÊNG (thanh · chữ số · icon) vì thanh và chữ số KHÔNG chồng lên nhau — gộp chung một object thì trình soát tương phản ghép
 * nhầm nền thanh với màu chữ số thành một cặp không có thật.
 */
const BAR_FILL: Record<CountdownTone, string> = {
  calm: 'bg-action-base',
  hurry: 'bg-action-warning',
  over: 'bg-action-disabled',
  urgent: 'bg-action-error',
};
const DIGIT_INK: Record<CountdownTone, string> = {
  calm: 'text-fg-1',
  hurry: 'text-warning',
  over: 'text-fg-2',
  urgent: 'text-error',
};
const ICON: Record<CountdownTone, { color: ThemeColorKey; name: IconName }> = {
  calm: { color: 'fg-brand', name: 'timer' },
  hurry: { color: 'warning', name: 'timer' },
  over: { color: 'fg-2', name: 'alert-warning' },
  urgent: { color: 'error', name: 'alert-warning' },
};

const HINT: Partial<Record<CountdownTone, string>> = {
  hurry: 'Sắp hết giờ',
  over: 'Đã khoá đáp án',
  urgent: 'Nhanh lên!',
};

const FULL_HEIGHT = { height: '100%' } as const;
const PULSE_SCALE = 1.14;

/**
 * Thanh + số giây còn lại theo đồng hồ server. Thanh CHẠY MƯỢT trên luồng UI (một `withTiming` tuyến tính từ phần còn lại tới 0
 * — không `setState` mỗi khung hình); chữ số cập nhật 4 lần/giây từ `useQuizCountdown`. Khi sắp hết giờ: thanh đổi thương hiệu →
 * cam → đỏ, icon đổi sang cảnh báo, có dòng chữ ("Sắp hết giờ"), chữ số nhấp nhô mỗi nhịp (tắt khi "Giảm chuyển động") — và
 * đọc cho trình đọc màn hình ở các MỐC (10 · 5 · 3 · hết giờ) chứ không mỗi giây (app.md p5-01 §7).
 *
 * ⛔ `Animated.View` không mang `className` (NativeWind + `useAnimatedStyle`): style hoạt hoạ ở lớp ngoài, phần nhìn thấy là
 * `View` lồng trong. "Giảm chuyển động" ⇒ thanh nhảy theo từng giây thay vì trượt liên tục.
 */
export function CountdownBar({ deadlineAt, offsetMs, totalSeconds }: CountdownBarProps) {
  const seconds = useQuizCountdown(deadlineAt, offsetMs);
  // Snapshot không mang `secondsPerQuestion` ⇒ lấy số giây còn lại lúc mount làm mốc 100% (vào giữa câu vẫn đúng tỉ lệ).
  const [initial] = useState(() =>
    Math.max(1, Math.ceil(remainingMs(deadlineAt, offsetMs) / 1000)),
  );
  const total = Math.max(1, totalSeconds ?? initial);
  const tone = countdownTone(seconds, total);
  const icon = ICON[tone];
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(Math.min(1, seconds / total));
  const pulse = useSharedValue(1);

  useCountdownAnnouncer(seconds, total);

  // Thanh trượt MỘT lần từ phần còn lại tới 0 theo giờ server — chạy lại chỉ khi mốc/độ lệch đồng hồ đổi, không mỗi giây.
  useEffect(() => {
    if (reduceMotion) return;
    const left = remainingMs(deadlineAt, offsetMs);
    fill.set(Math.min(1, left / (total * 1000)));
    fill.set(withTiming(0, { duration: left, easing: Easing.linear }));
  }, [deadlineAt, fill, offsetMs, reduceMotion, total]);

  // Giảm chuyển động: không trượt, thanh nhảy theo từng giây.
  useEffect(() => {
    if (reduceMotion) fill.set(Math.min(1, Math.max(0, seconds / total)));
  }, [fill, reduceMotion, seconds, total]);

  const pulsing = tone === 'urgent' && !reduceMotion;
  useEffect(() => {
    pulse.set(
      pulsing
        ? withRepeat(
            withSequence(
              withTiming(PULSE_SCALE, { duration: 180 }),
              withTiming(1, { duration: 320 }),
            ),
            -1,
          )
        : 1,
    );
  }, [pulse, pulsing]);

  const barStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  const digitStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));

  return (
    <View className="gap-xs">
      <View className="flex-row items-center justify-between gap-sm">
        <View className="flex-1 flex-row items-center gap-xs">
          <Icon color={icon.color} name={icon.name} size="sm" />
          <Text className="shrink text-label-md text-fg-2">{HINT[tone] ?? 'Thời gian'}</Text>
        </View>
        <Animated.View style={digitStyle}>
          <Text
            accessibilityLabel={countdownSpeech(seconds)}
            accessibilityLiveRegion={shouldAnnounce(seconds, total) ? 'polite' : 'none'}
            className={cn('text-header-md font-bold', DIGIT_INK[tone])}
          >
            {seconds === 0 ? 'Hết giờ' : `${String(seconds)}s`}
          </Text>
        </Animated.View>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-border-2">
        <Animated.View cssInterop={false} style={[FULL_HEIGHT, barStyle]}>
          <View className={cn('flex-1 rounded-full', BAR_FILL[tone])} />
        </Animated.View>
      </View>
    </View>
  );
}
