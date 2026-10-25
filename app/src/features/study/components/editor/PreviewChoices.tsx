import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { MATCH_MODE_LABELS } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';

interface OptionRowProps {
  /** Chữ cái A/B/C… của lựa chọn (bỏ trống cho Đúng/Sai). */
  letter?: string;
  /** Đánh dấu là đáp án đúng — chỉ khi đang xem mặt "Đáp án". */
  marked: boolean;
  text: string;
}

/** Một lựa chọn như người học thấy trong bài; mặt "Đáp án" thì lựa chọn đúng có dấu tích + chữ "Đúng" (không chỉ màu). */
function OptionRow({ letter, marked, text }: OptionRowProps) {
  return (
    <View
      className={cn(
        'min-h-[44px] flex-row items-center gap-xs rounded-sm border-hairline px-sm py-xs',
        marked ? 'border-border-success-subtle bg-surface-success' : 'border-border-1 bg-bg-1',
      )}
    >
      {letter ? (
        <View className="size-6 items-center justify-center rounded-full border-hairline border-border-2">
          <Text className="text-label-sm text-fg-2">{letter}</Text>
        </View>
      ) : null}
      <Text className={cn('flex-1 text-body-md', text ? 'text-fg-1' : 'text-fg-2')}>
        {text || 'Chưa nhập nội dung'}
      </Text>
      {marked ? (
        <>
          <Icon color="success" name="checkmark-circle" size={16} variant="solid" />
          <Text className="text-caption-sm font-semibold text-fg-1">Đúng</Text>
        </>
      ) : null}
    </View>
  );
}

export interface PreviewChoicesProps {
  item: DraftItem;
  /** `false`: mặt "Đề bài" (người học chưa biết đáp án) · `true`: mặt "Đáp án". */
  showAnswer: boolean;
}

/**
 * Phần lựa chọn của bản xem trước, đúng dạng người học sẽ gặp: trắc nghiệm/nhiều đáp án = danh sách A/B/C…, Đúng/Sai = hai ô,
 * điền chỗ trống = ô gõ (mặt Đề bài) hoặc danh sách đáp án chấp nhận + cách so khớp (mặt Đáp án). Thẻ ghi nhớ không có phần này —
 * mặt trước/sau của nó là chính `prompt`/`answerText` ở `PreviewBody`.
 */
export function PreviewChoices({ item, showAnswer }: PreviewChoicesProps) {
  if (item.type === 'MULTIPLE_CHOICE' || item.type === 'MULTI_SELECT') {
    return (
      <View className="gap-xs">
        {item.options.map((option, index) => (
          <OptionRow
            key={option.key}
            letter={String.fromCharCode(65 + index)}
            marked={showAnswer && item.correctKeys.includes(option.key)}
            text={option.text.trim()}
          />
        ))}
      </View>
    );
  }
  if (item.type === 'TRUE_FALSE') {
    return (
      <View className="gap-xs">
        <OptionRow marked={showAnswer && item.correct} text="Đúng" />
        <OptionRow marked={showAnswer && !item.correct} text="Sai" />
      </View>
    );
  }
  if (item.type === 'FILL_BLANK') {
    const answers = item.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean);
    return showAnswer ? (
      <View className="gap-xs">
        {answers.length > 0 ? (
          answers.map((answer, index) => <OptionRow key={index} marked text={answer} />)
        ) : (
          <OptionRow marked={false} text="" />
        )}
        <Text className="text-caption-sm text-fg-2">{MATCH_MODE_LABELS[item.matchMode]}</Text>
      </View>
    ) : (
      <View className="min-h-[44px] justify-center rounded-sm border-hairline border-border-1 bg-bg-input px-sm">
        <Text className="text-body-md text-fg-2">Người học gõ đáp án vào đây…</Text>
      </View>
    );
  }
  return null;
}
