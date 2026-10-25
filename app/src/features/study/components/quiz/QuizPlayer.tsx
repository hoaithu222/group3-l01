import { View } from 'react-native';

import type { StudyItemDto } from '../../api/study.types';
import type { QuickGrade } from '../../utils/quick-quiz-grader';
import { EnterView } from '../visual/EnterView';
import { QuizChoiceList } from './QuizChoiceList';
import { QuizExplanation } from './QuizExplanation';
import { QuizFillInput } from './QuizFillInput';
import { QuizQuestion } from './QuizQuestion';

export interface QuizPlayerProps {
  checked: QuickGrade | null;
  item: StudyItemDto;
  picked: readonly string[];
  onPick: (optionId: string, multi: boolean) => void;
  /** Phím "Xong" của bàn phím ở câu điền chỗ trống. */
  onSubmitText: () => void;
  onText: (text: string) => void;
}

/**
 * Thân màn làm bài — MỘT câu mỗi màn hình: đề (thẻ + gợi ý) rồi đáp án (thẻ bấm được, hoặc ô nhập), sau khi chấm thêm lời giải thích nếu tác giả có viết.
 * `key` theo khoá câu: sang câu kế là khối MỚI (mờ dần + trượt nhẹ vào — `EnterView` tôn trọng "Giảm chuyển động"), không mang trạng thái cũ.
 * Điện thoại một cột; nằm ngang chia đôi (đề bên trái, đáp án bên phải) vì chiều cao không đủ cho cả hai xếp chồng.
 */
export function QuizPlayer({
  checked,
  item,
  onPick,
  onSubmitText,
  onText,
  picked,
}: QuizPlayerProps) {
  const explanation = item.explanation?.trim() ?? '';

  return (
    <EnterView key={item.id} className="gap-md py-xs landscape:flex-row landscape:items-start">
      <View className="gap-md landscape:flex-1">
        <QuizQuestion item={item} />
      </View>
      <View className="gap-md landscape:flex-1">
        {item.type === 'FILL_BLANK' ? (
          <QuizFillInput
            correct={checked ? checked.correct : null}
            itemId={item.id}
            onChange={onText}
            onSubmit={onSubmitText}
          />
        ) : (
          <QuizChoiceList checked={checked !== null} item={item} picked={picked} onPick={onPick} />
        )}
        {checked && explanation.length > 0 ? (
          <QuizExplanation imageAssetId={item.backMediaAssetId} text={explanation} />
        ) : null}
      </View>
    </EnterView>
  );
}
