import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { PomodoroPhase } from '../api/pomodoro.types';

export interface CycleDotsProps {
  /** Số vòng tập trung ĐÃ hoàn thành của cả phiên (chưa chia dư). */
  completed: number;
  phase: PomodoroPhase;
  /** Số vòng bị bỏ qua (không tính vào vòng hoàn thành — PM-04). */
  skipped: number;
  /** `cyclesBeforeLongBreak` — số vòng cho tới lần nghỉ dài. */
  total: number;
}

/**
 * Tiến độ TRONG chu kỳ hiện tại: chấm + chữ "2/4" (không chỉ dựa vào màu chấm — app.md §2). Đủ `total` vòng thì sang nghỉ dài rồi đếm lại từ đầu;
 * đang nghỉ dài hiện đủ "4/4". Dòng dưới nói tổng số vòng đã xong của cả phiên (và số vòng bỏ qua nếu có).
 */
export function CycleDots({ completed, phase, skipped, total }: CycleDotsProps) {
  const safeTotal = Math.max(1, total);
  const inRound = phase === 'LONG_BREAK' ? safeTotal : completed % safeTotal;
  const summary =
    skipped > 0 ? `Đã xong ${completed} vòng · bỏ qua ${skipped}` : `Đã xong ${completed} vòng`;

  return (
    <View
      accessibilityLabel={`Vòng ${inRound} trên ${safeTotal}. ${summary}`}
      accessible
      className="items-center gap-2xs"
    >
      <View className="flex-row items-center gap-xs">
        <View
          className="flex-row items-center gap-2xs"
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: safeTotal }, (_, index) => (
            <View
              key={index}
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                index < inRound ? 'bg-action-base' : 'bg-action-tint-strong',
              )}
            />
          ))}
        </View>
        <Text className="text-label-md font-semibold text-fg-1">{`${inRound}/${safeTotal}`}</Text>
      </View>
      <Text className="text-caption-lg text-fg-2">{summary}</Text>
    </View>
  );
}
