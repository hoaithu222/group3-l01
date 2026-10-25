import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

import type { MockAnswerInput, MockQuestionPublic } from '../../api/mock-attempts.types';
import { tapHaptic } from '../../utils/mock-haptics';
import { selectedCount } from '../../utils/mock-nav-utils';
import { optionLetter } from '../../utils/mock-review-utils';
import { StudyAssetImage } from '../StudyAssetImage';
import { AnswerOption } from './AnswerOption';

/** Gợi ý cách trả lời theo loại câu — chữ, không chỉ hình ô tròn/vuông của đáp án. */
function answerHint(type: MockQuestionPublic['type'], picked: number): string {
  if (type === 'MULTI_SELECT') {
    return picked > 0 ? `Chọn tất cả đáp án đúng · Đã chọn ${picked}` : 'Chọn tất cả đáp án đúng';
  }
  return type === 'FILL_BLANK' ? 'Nhập câu trả lời vào ô bên dưới' : 'Chọn một đáp án';
}

/**
 * Một câu thi (app.md p4-02 §2 `QuestionView`): lựa chọn đơn / Đúng-Sai (chọn một), nhiều lựa chọn (bật/tắt), ô điền.
 * Đề KHÔNG có đáp án — chỉ ghi lựa chọn của người dùng. Bố cục: dòng "Câu 3/10" + công tắc "Đánh dấu xem lại", thẻ đề bài
 * rộng, dòng gợi ý cách trả lời, rồi từng đáp án là MỘT thẻ bấm được (`AnswerOption`).
 */
export function QuestionView({
  answer,
  disabled,
  flagged,
  onChange,
  onFlag,
  question,
  total,
}: {
  answer: MockAnswerInput | undefined;
  disabled?: boolean;
  /** Câu đang được đánh dấu "xem lại". */
  flagged: boolean;
  onChange: (answer: MockAnswerInput) => void;
  onFlag: () => void;
  question: MockQuestionPublic;
  total: number;
}) {
  const selected = answer?.optionIds ?? [];
  const multi = question.type === 'MULTI_SELECT';

  function toggle(optionId: string): void {
    let next: string[];
    if (!multi) next = [optionId];
    else if (selected.includes(optionId)) next = selected.filter((id) => id !== optionId);
    else next = [...selected, optionId];
    tapHaptic();
    onChange({ itemId: question.itemId, optionIds: next });
  }

  return (
    <View className="gap-md">
      <View className="flex-row items-center justify-between gap-sm">
        <Badge label={`Câu ${question.index + 1}/${total}`} variant="info" />
        <Chip
          label="Đánh dấu xem lại"
          leading={
            <Icon color="fg-brand" name="star" size={16} variant={flagged ? 'solid' : 'linear'} />
          }
          role="checkbox"
          selected={flagged}
          size="sm"
          onPress={onFlag}
        />
      </View>
      {/* Ảnh đề (`frontMediaAssetId`) — BE đã trả mà màn thi trước đây bỏ qua, trong khi Quiz nhanh vẫn vẽ: câu "nhìn hình trả lời"
          thành câu đố không có hình. Cùng khuôn `QuizQuestion` (ảnh trên, chữ dưới, URL ký qua `StudyAssetImage`). */}
      <Card>
        {question.frontMediaAssetId ? (
          <StudyAssetImage alt="Ảnh của câu hỏi" assetId={question.frontMediaAssetId} />
        ) : null}
        <Text className="text-header-sm text-fg-1">{question.prompt}</Text>
      </Card>
      <View className="flex-row items-center gap-xs">
        <Icon color="fg-2" name="alert-information" size={16} />
        <Text className="flex-1 text-label-md text-fg-2">
          {answerHint(question.type, selectedCount(answer))}
        </Text>
      </View>
      {question.type === 'FILL_BLANK' ? (
        <Input
          key={question.itemId}
          defaultValue={answer?.text ?? ''}
          disabled={disabled}
          label="Câu trả lời"
          placeholder="Nhập câu trả lời của bạn"
          onChangeText={(text) => onChange({ itemId: question.itemId, text })}
        />
      ) : (
        <View className="gap-sm">
          {question.options.map((o, i) => (
            <AnswerOption
              key={o.id}
              disabled={disabled}
              imageAssetId={o.mediaAssetId}
              letter={optionLetter(i)}
              multi={multi}
              selected={selected.includes(o.id)}
              text={o.text}
              onPress={() => toggle(o.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
