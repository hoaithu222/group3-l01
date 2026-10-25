import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { QuizOptionDto } from '../api/live-quiz.types';
import type { AnswerState } from '../hooks/useQuizAnswer';
import { choiceLabel } from '../utils/clock';
import { QUIZ_ERROR_MESSAGES } from '../utils/quiz-errors';
import { AnswerGrid } from './AnswerGrid';

interface QuestionPadProps {
  code?: string;
  /** Hết giờ / không phải người chơi ⇒ khoá cả bảng. */
  disabled?: boolean;
  options: QuizOptionDto[];
  selected: number | null;
  state: AnswerState;
  onChoose: (choice: number) => void;
  onRetry: () => void;
}

/**
 * Bảng lựa chọn của người chơi: lưới ô kiểu Kahoot (CHỮ CÁI + HÌNH KHỐI + màu — không chỉ dùng màu, xem `AnswerTile`). Chọn xong
 * khoá cả bảng (ô đã chọn viền đậm + ✓, các ô còn lại mờ đi); gửi lỗi (mất mạng) cho "Thử lại" khi còn hạn, hết giờ (`QUIZ_005`)
 * thì chỉ báo, không cho thử lại.
 */
export function QuestionPad({
  code,
  disabled,
  options,
  selected,
  state,
  onChoose,
  onRetry,
}: QuestionPadProps) {
  const locked = disabled === true || state === 'sending' || state === 'sent';
  const timedOut = code === 'QUIZ_005';

  return (
    <View className="gap-sm">
      <AnswerGrid
        loadingIndex={state === 'sending' ? selected : null}
        locked={locked}
        options={options}
        selected={selected}
        onChoose={onChoose}
      />
      {(state === 'sent' || state === 'sending') && selected !== null ? (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-center justify-center gap-xs rounded-md bg-surface-neutral px-md py-sm"
        >
          <Icon
            color={state === 'sent' ? 'success' : 'fg-2'}
            name={state === 'sent' ? 'checkmark-circle' : 'clock'}
            size="sm"
            variant={state === 'sent' ? 'solid' : 'linear'}
          />
          <Text className="text-label-md text-fg-1">
            {state === 'sent'
              ? `Đã chọn ${choiceLabel(selected)} — chờ kết quả`
              : `Đang gửi đáp án ${choiceLabel(selected)}…`}
          </Text>
        </View>
      ) : null}
      {state === 'error' ? (
        <Alert
          actions={
            !timedOut && disabled !== true ? (
              <Button label="Thử lại" size="xs" variant="danger-secondary" onPress={onRetry} />
            ) : undefined
          }
          description={QUIZ_ERROR_MESSAGES[code ?? ''] ?? 'Chưa gửi được câu trả lời'}
          tone={timedOut ? 'warning' : 'error'}
        />
      ) : null}
    </View>
  );
}
