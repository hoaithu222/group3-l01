import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { useResponsiveValue } from '@/shared/theme';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ProgressRing } from '@/shared/ui/progress-ring';

import { doneHaptic } from '../../utils/quick-quiz-haptics';
import { resultLevel, type WrongRow } from '../../utils/quick-quiz-result';
import type { QuizTally } from '../../utils/quick-quiz-session';
import { EnterView } from '../visual/EnterView';
import { WrongAnswerList } from './WrongAnswerList';

export interface QuizSummaryProps {
  rows: readonly WrongRow[];
  tally: QuizTally;
  onDone: () => void;
  onReplay: () => void;
  onRetryWrong: () => void;
}

/**
 * Tổng kết một lượt: vòng điểm % (`ProgressRing` của bộ chung) + nhận xét theo mức + chip số câu đúng/sai + chuỗi đúng dài nhất, rồi BA hành động — MỘT hành động
 * chính (có câu sai ⇒ "Luyện lại N câu sai", không thì "Chơi lại"), hai hành động phụ ("Chơi lại", "Xong") — rồi danh sách câu sai rút gọn. Hành động đặt TRƯỚC
 * danh sách để luôn thấy mà không phải cuộn. Nằm ngang: vòng điểm bên trái, hành động + danh sách bên phải.
 *
 * ⚠️ Nói thẳng đây là luyện tập trên máy — kết quả KHÔNG lưu, không cộng XP (đừng hứa ghi nhận điều app không ghi). Khối điểm là vùng `polite`; rung nhẹ
 * MỘT lần khi hiện (`doneHaptic`, rung theo cài đặt hệ điều hành).
 */
export function QuizSummary({ onDone, onReplay, onRetryWrong, rows, tally }: QuizSummaryProps) {
  const size = useResponsiveValue({ base: 132, tablet: 168 });
  const level = resultLevel(tally.percent);
  const wrong = tally.wrongIds.length;

  useEffect(() => {
    doneHaptic();
  }, []);

  return (
    <EnterView className="gap-lg py-md landscape:flex-row landscape:items-start landscape:gap-xl">
      <View accessibilityLiveRegion="polite" className="items-center gap-sm landscape:flex-1">
        <ProgressRing
          label={`Điểm ${tally.percent}%, đúng ${tally.correct} trên ${tally.total} câu`}
          progress={tally.percent / 100}
          size={size}
          tone={level.tone}
        >
          <Text className="text-header-lg text-fg-1">{`${tally.percent}%`}</Text>
          <Text className="text-caption-sm text-fg-2">điểm</Text>
        </ProgressRing>
        <Text accessibilityRole="header" className="text-header-sm text-fg-1">
          Hoàn thành!
        </Text>
        <Text className="text-center text-body-lg text-fg-2">{level.message}</Text>
        <View className="flex-row flex-wrap justify-center gap-xs">
          <Badge label={`${tally.correct} đúng`} variant="success" />
          <Badge label={`${wrong} sai`} variant={wrong > 0 ? 'error' : 'neutral'} />
          <Badge label={`Chuỗi dài nhất: ${tally.bestStreak}`} variant="info" />
        </View>
        <Text className="text-center text-caption-lg text-fg-2">
          Luyện tập trên máy — kết quả không được lưu và không cộng điểm/XP.
        </Text>
      </View>
      <View className="gap-lg landscape:flex-1">
        <View className="gap-sm">
          {wrong > 0 ? (
            <>
              <Button
                fullWidth
                label={`Luyện lại ${wrong} câu sai`}
                size="lg"
                onPress={onRetryWrong}
              />
              <Button fullWidth label="Chơi lại" variant="secondary" onPress={onReplay} />
            </>
          ) : (
            <Button fullWidth label="Chơi lại" size="lg" onPress={onReplay} />
          )}
          <Button fullWidth label="Xong" variant="tertiary" onPress={onDone} />
        </View>
        <WrongAnswerList rows={rows} total={wrong} />
      </View>
    </EnterView>
  );
}
