import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import { LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';

/**
 * Thẻ bọc bảng xếp hạng: đầu thẻ là ô icon tông cam của chế độ + tiêu đề "Bảng xếp hạng" (mốc `header` cho trình đọc màn hình).
 * Dùng chung cho bảng trực tiếp (`LiveLeaderboard`) và bảng kết quả bền (`ResultsScreen`) để hai nơi cùng một khuôn.
 */
export function BoardCard({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <IconTile name="star" size="sm" tone={LIVE_QUIZ_TONE} />
        <Text accessibilityRole="header" className="text-label-lg text-fg-1">
          Bảng xếp hạng
        </Text>
      </View>
      {children}
    </Card>
  );
}
