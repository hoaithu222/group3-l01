import { Text, View } from 'react-native';

import { QuizProgressBar } from './QuizProgressBar';
import { StreakBadge } from './StreakBadge';

export interface QuizProgressHeaderProps {
  /** Số câu đã CHẤM xong (kể cả câu vừa chấm) — thanh chạy khi phản hồi hiện, không đợi sang câu kế. */
  done: number;
  /** Vị trí câu đang làm, từ 1. */
  position: number;
  streak: number;
  total: number;
}

/**
 * Đầu phiên làm bài: "3 / 10" + chuỗi đúng + thanh tiến độ, đặt ở khe `header` của `Screen` (dưới `AppBar`) để KHÔNG cuộn đi mất khi câu dài. Lề 16 ở đây vì
 * khe `header` không có lề ngang riêng. Bộ đếm là vùng `polite` mang nhãn "Câu 3 trên 10" — sang câu kế trình đọc màn hình báo vị trí mới.
 */
export function QuizProgressHeader({ done, position, streak, total }: QuizProgressHeaderProps) {
  return (
    <View className="gap-xs px-md pb-sm">
      <View className="flex-row items-center justify-between gap-sm">
        <Text
          accessibilityLabel={`Câu ${position} trên ${total}`}
          accessibilityLiveRegion="polite"
          className="text-label-lg text-fg-1"
        >
          {`${position} / ${total}`}
        </Text>
        <StreakBadge streak={streak} />
      </View>
      <QuizProgressBar percent={total === 0 ? 0 : Math.round((done / total) * 100)} />
    </View>
  );
}
