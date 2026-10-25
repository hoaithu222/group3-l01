import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { useFeature } from '@/shell/capabilities';

import type { QuizResultRowDto } from '../api/live-quiz.types';
import { useResultSetId } from '../hooks/useResultSetId';
import { useLiveQuizStore } from '../store/live-quiz.store';
import { studySetHref } from '../utils/live-quiz-routes';
import { wrongAnswersOf } from '../utils/wrong-answers';
import { WrongAnswerItem } from './WrongAnswerItem';

interface WrongAnswersCardProps {
  /** Hàng kết quả của CHÍNH TÔI (kèm `answers` từ BE). */
  mine: QuizResultRowDto;
  sessionId: string;
  /** `setId` do `GET …/results` trả (BE mới) — có thì khỏi tra qua lịch sử thi. */
  setId?: string;
}

/**
 * "Ôn lại câu sai" (app.md p5-01 §3 `Kết quả`). Số câu sai lấy từ `answers` của server (đúng cả khi mở lại từ lịch sử);
 * NỘI DUNG từng câu (đề, đáp án tôi chọn, đáp án đúng, giải thích) lấy từ những gì máy này đã thấy trong phiên
 * (`live-quiz.store`) — BE không cho tải lại đề từng câu, nên mở kết quả trên máy khác/sau khi mở lại app thì chỉ còn số
 * câu. Cờ `study` bật và tra được bộ học ⇒ thêm lối sang bộ học để ôn tiếp bằng thẻ ghi nhớ (SR/flashcard của p4).
 * Đúng hết ⇒ chỉ một dải khen (icon + chữ), không có khối câu sai.
 */
export function WrongAnswersCard({ mine, sessionId, setId: knownSetId }: WrongAnswersCardProps) {
  const answers = useLiveQuizStore((state) => state.answers);
  const questions = useLiveQuizStore((state) => state.questions);
  const reveals = useLiveQuizStore((state) => state.reveals);
  const storedSession = useLiveQuizStore((state) => state.sessionId);
  const [open, setOpen] = useState(false);
  const studyOn = useFeature('study') === true;
  // Server cũ chưa trả `setId` ở results ⇒ đường lùi: tra qua lịch sử (chỉ khi cần lối sang bộ học).
  const historySetId = useResultSetId(sessionId, studyOn && !knownSetId);
  const setId = knownSetId ?? historySetId;

  const local = useMemo(
    () => wrongAnswersOf({ answers, questions, reveals, sessionId: storedSession }, sessionId),
    [answers, questions, reveals, sessionId, storedSession],
  );
  const wrongCount = mine.answers
    ? mine.answers.filter((answer) => !answer.correct).length
    : local.length;

  if (wrongCount === 0) {
    return mine.answered > 0 ? (
      <View className="flex-row items-center gap-sm rounded-md border-hairline border-border-success-subtle bg-surface-success p-md">
        <Icon color="success" name="checkmark-circle" size="lg" variant="solid" />
        <Text className="flex-1 text-body-md font-semibold text-fg-1">
          Bạn trả lời đúng tất cả các câu — tuyệt vời!
        </Text>
      </View>
    ) : null;
  }

  return (
    <Card title={`Câu bạn làm sai (${String(wrongCount)})`}>
      <View className="gap-sm">
        {local.length === 0 ? (
          <Text className="text-body-md text-fg-2">
            Chi tiết từng câu chỉ xem lại được trên máy đã chơi phiên này, ngay sau khi kết thúc.
          </Text>
        ) : (
          <Button
            accessibilityLabel={open ? 'Ẩn các câu sai' : 'Ôn lại câu sai'}
            iconRight={open ? 'arrow-up-small' : 'arrow-down-small'}
            label={open ? 'Ẩn các câu sai' : 'Ôn lại câu sai'}
            size="sm"
            variant="warning-secondary"
            onPress={() => setOpen((value) => !value)}
          />
        )}
        {open ? local.map((wrong) => <WrongAnswerItem key={wrong.index} wrong={wrong} />) : null}
        {studyOn && setId ? (
          <Button
            iconLeft="book"
            label="Ôn tiếp bằng thẻ ghi nhớ"
            size="sm"
            variant="tertiary"
            onPress={() => router.push(studySetHref(setId))}
          />
        ) : null}
      </View>
    </Card>
  );
}
