import { Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { PomodoroPhase } from '../api/pomodoro.types';
import { PHASE_LABEL, phaseIcon, phaseTone, type PhaseTone } from '../utils/phase';

const TONE_TEXT: Record<PhaseTone, string> = {
  break: 'text-success',
  focus: 'text-fg-brand',
  idle: 'text-fg-2',
  paused: 'text-warning',
};

const TONE_ICON: Record<PhaseTone, ThemeColorKey> = {
  break: 'success',
  focus: 'fg-brand',
  idle: 'fg-2',
  paused: 'warning',
};

export interface PhaseLabelProps {
  /** Dòng phụ: vì sao đang dừng / đang chờ gì (`phaseHint`). */
  hint?: string | null;
  phase: PomodoroPhase;
}

/**
 * Giai đoạn hiện tại — nhãn CHỮ + icon, không chỉ dựa vào màu (app.md p5-02 §7): "Tập trung" / "Nghỉ ngắn" / "Nghỉ dài" / "Tạm dừng" /
 * "Chờ bắt đầu". `accessibilityLiveRegion="polite"` để sang giai đoạn mới thì trình đọc màn hình báo một lần (khác đồng hồ — không báo mỗi giây).
 */
export function PhaseLabel({ hint, phase }: PhaseLabelProps) {
  const tone = phaseTone(phase);
  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-3xs">
      <View className="flex-row items-center gap-2xs">
        <Icon color={TONE_ICON[tone]} name={phaseIcon(phase)} size="sm" />
        <Text className={cn('text-label-lg font-semibold', TONE_TEXT[tone])}>
          {PHASE_LABEL[phase]}
        </Text>
      </View>
      {hint ? <Text className="text-center text-caption-lg text-fg-2">{hint}</Text> : null}
    </View>
  );
}
