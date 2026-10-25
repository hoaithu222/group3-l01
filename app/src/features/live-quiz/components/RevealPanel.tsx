import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

import type { QuizOptionDto, QuizRevealDto } from '../api/live-quiz.types';
import { MotionView } from './MotionView';
import { RevealOptionRow } from './RevealOptionRow';
import { RevealVerdict, type Verdict } from './RevealVerdict';

interface RevealPanelProps {
  /** Điểm tôi vừa nhận ở câu này (0/không có ⇒ ẩn). */
  gain?: number;
  /** Lựa chọn của tôi ở câu này (người chơi, `null` = chưa trả lời); host để `undefined`. */
  myChoice?: number | null;
  options: QuizOptionDto[];
  reveal: QuizRevealDto;
  /** Chuỗi câu đúng liên tiếp của tôi (đếm từ dữ liệu máy này thấy). */
  streak?: number;
}

const verdictOf = (myChoice: number | null, correct: number | null): Verdict =>
  myChoice === null ? 'none' : myChoice === correct ? 'correct' : 'wrong';

/**
 * Lộ đáp án: kết luận của tôi (người chơi) → tỉ lệ cả phòng chọn đúng → từng phương án kèm số người chọn → lời giải thích.
 * Số liệu đều lấy từ `quiz:reveal` (`stats` theo chỉ số lựa chọn); dòng "x% chọn đúng" tính từ chính `stats`, không suy đoán.
 */
export function RevealPanel({ gain, myChoice, options, reveal, streak }: RevealPanelProps) {
  const total = Object.values(reveal.stats).reduce((sum, n) => sum + n, 0);
  const correctCount = reveal.correct === null ? 0 : (reveal.stats[String(reveal.correct)] ?? 0);
  const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <View className="gap-sm">
      {myChoice === undefined ? null : (
        <RevealVerdict gain={gain} streak={streak} verdict={verdictOf(myChoice, reveal.correct)} />
      )}
      <Text accessibilityLiveRegion="polite" className="text-label-md text-fg-2">
        {total > 0
          ? `${String(rate)}% chọn đúng (${String(correctCount)}/${String(total)} người)`
          : 'Chưa có ai trả lời câu này'}
      </Text>
      {options.map((option, i) => (
        <MotionView key={`${String(i)}-${option.text}`} index={i}>
          <RevealOptionRow
            correct={i === reveal.correct}
            count={reveal.stats[String(i)] ?? 0}
            index={i}
            mine={myChoice === i}
            percent={total > 0 ? ((reveal.stats[String(i)] ?? 0) / total) * 100 : 0}
            text={option.text}
          />
        </MotionView>
      ))}
      {reveal.explanation ? (
        <Alert description={reveal.explanation} title="Giải thích" tone="info" />
      ) : null}
    </View>
  );
}
