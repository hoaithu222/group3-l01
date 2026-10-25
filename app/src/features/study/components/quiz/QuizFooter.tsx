import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';
import { useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

import type { QuickGrade } from '../../utils/quick-quiz-grader';
import { QuizFeedbackBar } from './QuizFeedbackBar';

export interface QuizFooterProps {
  /** Đáp án đúng bằng chữ (cho phản hồi khi sai). */
  answer: string;
  canCheck: boolean;
  /** Kết quả chấm câu hiện tại; `null` = chưa chấm ⇒ nút "Kiểm tra". */
  checked: QuickGrade | null;
  isLast: boolean;
  streak: number;
  onCheck: () => void;
  onNext: () => void;
}

/**
 * Thanh đáy dính của màn làm bài: chưa chấm ⇒ một nút "Kiểm tra" (khoá tới khi có đáp án); đã chấm ⇒ phản hồi đúng/sai NGAY TRÊN nút "Câu tiếp" (câu cuối:
 * "Xem kết quả"). Phản hồi đặt ở đây — không ở thân cuộn — để luôn thấy dù câu dài, và ngay cạnh chỗ ngón tay sắp bấm.
 * `KeyboardStickyView` cho nút nhảy lên trên bàn phím ở câu điền chỗ trống; `BottomActionBar` tự cộng vùng an toàn (⛔ `Screen` cố tình không đệm khe này).
 * Nằm ngang: phản hồi và nút xếp CÙNG HÀNG (`landscape:flex-row`) vì chiều cao ~300dp không đủ xếp chồng mà vẫn chừa chỗ cho câu hỏi.
 */
export function QuizFooter({
  answer,
  canCheck,
  checked,
  isLast,
  onCheck,
  onNext,
  streak,
}: QuizFooterProps) {
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  return (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar contentClassName="landscape:flex-row landscape:items-center landscape:gap-md">
        {checked ? (
          <View className="landscape:flex-1">
            <QuizFeedbackBar
              answer={answer}
              correct={checked.correct}
              partial={checked.partial}
              streak={streak}
            />
          </View>
        ) : null}
        <View className="landscape:w-56">
          {checked ? (
            <Button
              fullWidth
              iconRight="arrow-right"
              label={isLast ? 'Xem kết quả' : 'Câu tiếp'}
              size="lg"
              onPress={onNext}
            />
          ) : (
            <Button disabled={!canCheck} fullWidth label="Kiểm tra" size="lg" onPress={onCheck} />
          )}
        </View>
      </BottomActionBar>
    </KeyboardStickyView>
  );
}
