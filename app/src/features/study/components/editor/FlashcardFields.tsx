import type { Ref } from 'react';
import type { TextInput } from 'react-native';

import { Input } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';
import type { ItemProblem } from '../../utils/item-validation';
import { fieldMessage } from './field-message';

export interface FlashcardFieldsProps {
  /** Ref của ô định nghĩa — ô "Thuật ngữ" ở `ItemForm` nhảy con trỏ vào đây khi bấm "Tiếp". */
  answerRef: Ref<TextInput>;
  item: DraftItem;
  limits: StudyLimits;
  problems: readonly ItemProblem[];
  onChange: (patch: Partial<DraftItem>) => void;
}

/** Mặt sau của thẻ ghi nhớ (định nghĩa/đáp án) — có bộ đếm ký tự. Mặt trước là `prompt` chung ở `ItemForm`. */
export function FlashcardFields({
  answerRef,
  item,
  limits,
  onChange,
  problems,
}: FlashcardFieldsProps) {
  return (
    <Input
      ref={answerRef}
      hint={`${item.answerText.length}/${limits.promptMax}`}
      label="Định nghĩa (mặt sau)"
      maxLength={limits.promptMax}
      message={fieldMessage(problems, 'answerText')}
      messageTone="error"
      multiline
      placeholder="Ví dụ: môi trường"
      required
      value={item.answerText}
      onChangeText={(answerText) => onChange({ answerText })}
    />
  );
}
