import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { StudyItemDto } from '../../api/study.types';
import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { useQuickQuiz } from '../../hooks/useQuickQuiz';
import { useQuizExitGuard } from '../../hooks/useQuizExitGuard';
import { backText } from '../../utils/item-summary';
import { wrongRows } from '../../utils/quick-quiz-result';
import { QuizFooter } from './QuizFooter';
import { QuizPlayer } from './QuizPlayer';
import { QuizProgressHeader } from './QuizProgressHeader';
import { QuizSetup } from './QuizSetup';
import { QuizSummary } from './QuizSummary';

export interface QuickQuizSessionProps {
  /** Các câu chấm được của bộ (`quizItems`), không rỗng. */
  pool: readonly StudyItemDto[];
  /** Tên bộ — dòng phụ dưới tiêu đề "Quiz nhanh". */
  setTitle?: string;
  onLeave: () => void;
}

/**
 * Một phiên Quiz nhanh: MỘT `Screen` chung cho ba giai đoạn — thiết lập (khối đầu màn + nút "Bắt đầu" dính đáy) → làm bài (đầu phiên n/tổng + chuỗi đúng; đề và
 * đáp án; thanh đáy Kiểm tra/Câu tiếp kèm phản hồi) → tổng kết. Một Screen duy nhất để chuyển giai đoạn không dựng lại khung/gradient. Toàn bộ chạy TRÊN MÁY,
 * không gọi API, không lưu điểm.
 *
 * Rời giữa lượt (nút quay lại trên thanh tiêu đề HOẶC phím Back cứng) phải qua hộp thoại xác nhận — tiến độ chỉ ở bộ nhớ nên thoát là mất; thiết lập/tổng
 * kết thì rời ngay. `constrained` tắt khi nằm ngang: hai cột (đề | đáp án) cần cả bề rộng. `keyboardAware` chỉ khi bộ CÓ câu điền chỗ trống.
 */
export function QuickQuizSession({ onLeave, pool, setTitle }: QuickQuizSessionProps) {
  const quiz = useQuickQuiz(pool);
  const guard = useQuizExitGuard(quiz.inProgress, onLeave);
  const { isLandscape } = useBreakpoint();
  const { current, run, summary } = quiz;
  const playing = run !== null && current !== undefined && !quiz.finished;

  const header = (
    <View>
      <AppBar subtitle={setTitle} title={STUDY_MODE_META.quick.label} onBack={guard.requestLeave} />
      {playing ? (
        <QuizProgressHeader
          done={run.index + (run.checked ? 1 : 0)}
          position={run.index + 1}
          streak={run.streak}
          total={run.order.length}
        />
      ) : null}
    </View>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (playing) {
    body = (
      <QuizPlayer
        checked={run.checked}
        item={current}
        picked={run.picked}
        onPick={quiz.pick}
        onSubmitText={quiz.check}
        onText={quiz.text}
      />
    );
    footer = (
      <QuizFooter
        answer={backText(current).replace(/\n/g, ' / ')}
        canCheck={quiz.canCheck}
        checked={run.checked}
        isLast={run.index >= run.order.length - 1}
        streak={run.streak}
        onCheck={quiz.check}
        onNext={quiz.next}
      />
    );
  } else if (summary && quiz.finished) {
    body = (
      <QuizSummary
        rows={wrongRows(summary.wrongIds, quiz.byId)}
        tally={summary}
        onDone={onLeave}
        onReplay={quiz.start}
        onRetryWrong={quiz.retryWrong}
      />
    );
  } else {
    body = (
      <QuizSetup
        choices={quiz.choices}
        config={quiz.config}
        total={quiz.total}
        onCount={quiz.setCount}
        onShuffle={quiz.setShuffle}
      />
    );
    footer = (
      <BottomActionBar>
        <Button fullWidth iconLeft="play" label="Bắt đầu" size="lg" onPress={quiz.start} />
      </BottomActionBar>
    );
  }

  return (
    <Screen
      constrained={!isLandscape}
      footer={footer}
      header={header}
      keyboardAware={pool.some((item) => item.type === 'FILL_BLANK')}
    >
      {body}
      <Dialog
        description="Tiến độ của lượt này sẽ mất — Quiz nhanh không lưu kết quả."
        primaryAction={{ label: 'Thoát', onPress: guard.confirm }}
        secondaryAction={{ label: 'Ở lại', onPress: guard.cancel }}
        title="Thoát Quiz nhanh?"
        variant="warning"
        visible={guard.asking}
        onClose={guard.cancel}
      />
    </Screen>
  );
}
