import { View } from 'react-native';

import type { LiveQuizSnapshot, QuizQuestionDto } from '../api/live-quiz.types';
import { useQuizAnswer } from '../hooks/useQuizAnswer';
import { useQuizCountdown } from '../hooks/useQuizCountdown';
import { useRevealHaptics } from '../hooks/useRevealHaptics';
import { useScoreGain } from '../hooks/useScoreGain';
import { useLiveQuizStore } from '../store/live-quiz.store';
import { answerStreak } from '../utils/answer-streak';
import { AnswerGrid } from './AnswerGrid';
import { CountdownBar } from './CountdownBar';
import { HostAnswerProgress } from './HostAnswerProgress';
import { LiveLeaderboard } from './LiveLeaderboard';
import { QuestionCard } from './QuestionCard';
import { QuestionPad } from './QuestionPad';
import { RevealPanel } from './RevealPanel';

interface QuestionStageProps {
  isHost: boolean;
  offsetMs: number;
  question: QuizQuestionDto;
  sessionId: string;
  snapshot: LiveQuizSnapshot;
}

/**
 * Một câu hỏi từ lúc mở tới lúc công bố. ⚠️ Nơi gọi đặt `key={question.index}` — trạng thái gửi/ack của câu cũ phải mất
 * theo component, không mang sang câu mới (lựa chọn đã lưu ở `live-quiz.store` theo chỉ số câu nên vẫn đúng khi dựng lại); cũng
 * nhờ `key` mà `useScoreGain` chụp được điểm lúc MỞ câu để tính điểm vừa nhận.
 *
 * Bố cục: điện thoại một cột — đồng hồ · thẻ câu hỏi · bảng đáp án (bảng xếp hạng chỉ hiện lúc công bố, dưới lộ đáp án); máy tính
 * bảng (`tablet:` ≥ 600dp) hai cột — câu hỏi | bảng xếp hạng luôn hiện (app.md p5-01 §7: host trình chiếu ở tablet ngang).
 */
export function QuestionStage({
  isHost,
  offsetMs,
  question,
  sessionId,
  snapshot,
}: QuestionStageProps) {
  const answer = useQuizAnswer(sessionId, question.index, question.deadlineAt, offsetMs);
  const seconds = useQuizCountdown(question.deadlineAt, offsetMs);
  const gain = useScoreGain(snapshot.me?.score);
  const answers = useLiveQuizStore((state) => state.answers);
  const reveals = useLiveQuizStore((state) => state.reveals);
  const storedSession = useLiveQuizStore((state) => state.sessionId);
  const reveal =
    snapshot.phase === 'REVEAL' && snapshot.reveal?.index === question.index
      ? snapshot.reveal
      : null;
  // Có mốc mở câu thì tính tổng giây CHÍNH XÁC (vào giữa câu vẫn đúng tỉ lệ thanh); không có thì `CountdownBar` tự lấy mốc.
  const totalSeconds =
    question.questionStartedAt === undefined
      ? undefined
      : Math.max(1, Math.round((question.deadlineAt - question.questionStartedAt) / 1000));
  const streak =
    reveal && !isHost
      ? answerStreak(
          { answers, reveals, sessionId: storedSession },
          sessionId,
          question.index,
          reveal.correct,
        )
      : 0;

  useRevealHaptics(
    reveal && !isHost ? (answer.selected === reveal.correct ? 'correct' : 'wrong') : null,
  );

  return (
    <View className="gap-md tablet:flex-row tablet:items-start tablet:gap-lg">
      <View className="gap-md tablet:flex-1">
        {reveal ? null : (
          <CountdownBar
            deadlineAt={question.deadlineAt}
            offsetMs={offsetMs}
            totalSeconds={totalSeconds}
          />
        )}
        <QuestionCard index={question.index} prompt={question.prompt} total={snapshot.total} />

        {reveal ? (
          <RevealPanel
            gain={gain}
            myChoice={isHost ? undefined : answer.selected}
            options={question.options}
            reveal={reveal}
            streak={streak}
          />
        ) : isHost ? (
          <View className="gap-sm">
            {/* `quiz:progress` chỉ tới host: số người đã trả lời / số người trong phòng. */}
            <HostAnswerProgress
              answered={snapshot.answeredCount ?? 0}
              total={snapshot.playersCount ?? snapshot.players.length}
            />
            <AnswerGrid options={question.options} />
          </View>
        ) : (
          <QuestionPad
            code={answer.code}
            disabled={seconds === 0}
            options={question.options}
            selected={answer.selected}
            state={answer.state}
            onChoose={answer.choose}
            onRetry={answer.retry}
          />
        )}
      </View>

      <View className={reveal ? 'gap-md tablet:w-2/5' : 'hidden gap-md tablet:flex tablet:w-2/5'}>
        <LiveLeaderboard
          me={isHost ? null : snapshot.me}
          players={snapshot.players}
          rows={snapshot.leaderboardTop}
        />
      </View>
    </View>
  );
}
