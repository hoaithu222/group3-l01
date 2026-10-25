import { Text, View } from 'react-native';

export interface SkillProgressBarProps {
  current: number;
  target: number;
  /** Chữ đi kèm thanh — BẮT BUỘC (tiến độ luôn có số + chữ, không chỉ màu — app.md p6-06 §7), vd "32/50 task". */
  caption: string;
  /** Nhãn đọc cho trình đọc màn hình (mặc định = `caption`). */
  accessibilityLabel?: string;
}

/**
 * Thanh tiến độ tới một ngưỡng kỹ năng (task, điểm…). Phần trăm kẹp 0–100; ngưỡng 0 (không áp dụng) coi là đạt. Cùng khuôn
 * `LevelProgressBar` (gamification) nhưng dùng chung cho p6-06/p6-07 nên đặt ở `@/shared/career`.
 */
export function SkillProgressBar({ accessibilityLabel, caption, current, target }: SkillProgressBarProps) {
  const percent = target <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((current / target) * 100)));

  return (
    <View className="gap-2xs self-stretch">
      <View
        accessibilityLabel={accessibilityLabel ?? caption}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: 100, min: 0, now: percent }}
        className="h-2 overflow-hidden rounded-full bg-bg-3"
      >
        <View className="h-2 rounded-full bg-action-base" style={{ width: `${percent}%` }} />
      </View>
      <Text className="text-caption-lg text-fg-2">{caption}</Text>
    </View>
  );
}
