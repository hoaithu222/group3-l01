import { Text, View, type TextStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColors, type ThemeColorKey } from '@/shared/theme';

import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroClock } from '../hooks/usePomodoroClock';
import { phaseTone, type PhaseTone } from '../utils/phase';

const STROKE = 12;
const DEFAULT_SIZE = 240;

const TONE_COLOR: Record<PhaseTone, ThemeColorKey> = {
  break: 'success',
  focus: 'action-base',
  idle: 'indicator-muted',
  paused: 'warning',
};

/** Số đồng hồ giữ bề rộng chữ số cố định để con số không "rung" mỗi giây (font có `tnum`; thiếu thì bỏ qua êm). */
const DIGITS: TextStyle = { fontVariant: ['tabular-nums'] };

export interface PomodoroClockProps {
  channelId: string;
  size?: number;
  snapshot: PomodoroSnapshot | undefined;
}

/**
 * Vòng tròn tiến độ (`react-native-svg`) + số lớn `MM:SS` (app.md p5-02 §2). Chỉ ĐỌC: nhãn giai đoạn nằm ở `PhaseLabel` (chữ, không dựa vào màu).
 * Nhãn trợ năng "Còn khoảng 12 phút, giai đoạn Tập trung" đổi mỗi PHÚT (không phải mỗi giây — §7); `accessibilityRole="timer"` để trình đọc
 * hiểu đây là đồng hồ. Vòng nhích theo phần đã trôi, xuất phát ở 12 giờ và chạy thuận chiều kim đồng hồ.
 */
export function PomodoroClock({ channelId, size = DEFAULT_SIZE, snapshot }: PomodoroClockProps) {
  const clock = usePomodoroClock(snapshot, channelId);
  const colors = useThemeColors();
  const tone = snapshot ? phaseTone(snapshot.phase) : 'idle';
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View
      accessibilityLabel={clock.a11yLabel}
      accessibilityRole="timer"
      accessible
      className="items-center justify-center self-center"
      style={{ height: size, width: size }}
    >
      <Svg height={size} width={size}>
        <Circle cx={center} cy={center} fill="none" r={radius} stroke={colors['border-1']} strokeWidth={STROKE} />
        <Circle
          cx={center}
          cy={center}
          fill="none"
          origin={`${center}, ${center}`}
          r={radius}
          rotation={-90}
          stroke={colors[TONE_COLOR[tone]]}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clock.progress)}
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
      </Svg>
      <View className="absolute items-center justify-center" importantForAccessibility="no-hide-descendants">
        <Text className="text-display font-bold text-fg-1" maxFontSizeMultiplier={1.2} style={DIGITS}>
          {clock.text}
        </Text>
      </View>
    </View>
  );
}
