import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import { LIVE_QUIZ_ICON, LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { GrowBar } from './GrowBar';

interface QuestionCardProps {
  /** Chỉ số câu, từ 0. */
  index: number;
  prompt: string;
  total: number;
}

/**
 * Thẻ câu hỏi lớn: đầu thẻ là "Câu 3/10" kèm thanh tiến độ cả phiên, thân là đề bài cỡ chữ to (`header-sm`, lên `header-md` từ
 * máy tính bảng) — chiếm chỗ chính của màn để người chơi đọc đề trước khi nhìn tới bảng đáp án. Đề bài là tiêu đề (`header`) của
 * màn để trình đọc màn hình nhảy thẳng tới; nhãn "Câu n/N" đứng ngay trước nên được đọc trước đề.
 */
export function QuestionCard({ index, prompt, total }: QuestionCardProps) {
  const percent = total > 0 ? ((index + 1) / total) * 100 : 0;

  return (
    <Card className="min-h-36 gap-sm border-hairline border-border-warning-subtle">
      <View className="flex-row items-center gap-sm">
        <IconTile name={LIVE_QUIZ_ICON} size="sm" tone={LIVE_QUIZ_TONE} />
        <Text className="text-label-lg text-fg-1">{`Câu ${String(index + 1)}/${String(total)}`}</Text>
      </View>
      <GrowBar className="h-1.5" fillClassName="bg-action-warning" percent={percent} />
      <Text
        accessibilityRole="header"
        className="text-header-sm font-semibold text-fg-1 tablet:text-header-md"
      >
        {prompt}
      </Text>
    </Card>
  );
}
