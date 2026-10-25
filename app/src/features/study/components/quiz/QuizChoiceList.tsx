import { View } from 'react-native';

import type { StudyItemDto } from '../../api/study.types';
import { cardState } from '../../utils/quick-quiz-result';
import { quizOptions } from '../../utils/quick-quiz-items';
import { AnswerCard } from './AnswerCard';

export interface QuizChoiceListProps {
  /** Đã chấm câu này chưa — sau đó thẻ khoá và tô đúng/sai. */
  checked: boolean;
  item: StudyItemDto;
  picked: readonly string[];
  onPick: (optionId: string, multi: boolean) => void;
}

/** Danh sách đáp án của câu trắc nghiệm / đúng-sai / nhiều đáp án: mỗi lựa chọn là một `AnswerCard`, ký hiệu A, B, C… theo thứ tự. */
export function QuizChoiceList({ checked, item, onPick, picked }: QuizChoiceListProps) {
  const multi = item.type === 'MULTI_SELECT';

  return (
    <View className="gap-sm">
      {quizOptions(item).map((option, index) => (
        <AnswerCard
          key={option.id}
          disabled={checked}
          imageAssetId={option.mediaAssetId}
          letter={String.fromCharCode(65 + index)}
          multi={multi}
          state={cardState(option.id, picked, item.correctOptionIds, checked)}
          text={option.text}
          onPress={() => onPick(option.id, multi)}
        />
      ))}
    </View>
  );
}
