import { View } from 'react-native';

export interface QuestProgressBarProps {
  /** Nhãn trợ năng đầy đủ ("Đã xong 2 trên 5") — thanh chỉ là hình, nghĩa nằm ở chữ. */
  accessibilityLabel: string;
  progress: number;
  target: number;
}

/**
 * Thanh tiến độ mảnh (nhiệm vụ ngày, trần xu hôm nay). Tự dựng vì bộ chung chỉ có `Progress` (các bước dọc) và `ProgressRing`; cùng dáng với thanh của
 * `gamification/LevelProgressBar` (feature khác — cấm import chéo). Phần trăm KẸP 0–100: `progress` có thể vượt `target` (trần đổi giữa chừng) mà thanh không tràn.
 */
export function QuestProgressBar({ accessibilityLabel, progress, target }: QuestProgressBarProps) {
  const percent =
    target > 0 ? Math.min(100, Math.max(0, Math.round((progress / target) * 100))) : 0;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      accessible
      className="h-2 overflow-hidden rounded-full bg-bg-3"
    >
      <View className="h-2 rounded-full bg-action-base" style={{ width: `${percent}%` }} />
    </View>
  );
}
