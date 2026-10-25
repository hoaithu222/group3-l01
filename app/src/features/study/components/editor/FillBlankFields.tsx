import { useEffect, useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';
import { hapticTap } from '../../utils/editor-haptics';
import type { ItemProblem } from '../../utils/item-validation';
import { AnimatedRow } from './AnimatedRow';
import { fieldMessage } from './field-message';
import { MatchModeField } from './MatchModeField';

export interface FillBlankFieldsProps {
  item: DraftItem;
  limits: StudyLimits;
  problems: readonly ItemProblem[];
  onChange: (patch: Partial<DraftItem>) => void;
}

/**
 * Điền chỗ trống: các đáp án chấp nhận (1–10) + cách so khớp (hoa/thường, dấu). Enter ở một đáp án nhảy sang đáp án kế; ở đáp án
 * CUỐI (đã gõ chữ, chưa chạm trần) thì thêm một dòng mới và đặt con trỏ vào đó — liệt kê các cách viết chỉ cần gõ + Enter.
 * Hàng khoá theo CHỈ SỐ (đáp án là mảng chuỗi, không có id) nên xoá hàng không chạy hiệu ứng thoát — mờ dần sẽ rơi nhầm hàng cuối.
 */
export function FillBlankFields({ item, limits, onChange, problems }: FillBlankFieldsProps) {
  const answers = item.acceptedAnswers.length > 0 ? item.acceptedAnswers : [''];
  const canAdd = answers.length < limits.acceptedAnswersMax;
  const setAnswers = (next: string[]) => onChange({ acceptedAnswers: next });

  const inputs = useRef<(TextInput | null)[]>([]);
  const focusNewest = useRef(false);
  const [initialCount] = useState(answers.length);

  // Dòng vừa thêm bằng Enter: chờ nó vào cây rồi mới đặt con trỏ.
  useEffect(() => {
    if (!focusNewest.current) return;
    focusNewest.current = false;
    inputs.current[answers.length - 1]?.focus();
  }, [answers.length]);

  function submitFrom(index: number): void {
    if (index < answers.length - 1) {
      inputs.current[index + 1]?.focus();
      return;
    }
    if (!canAdd || !(answers[index] ?? '').trim()) return;
    focusNewest.current = true;
    hapticTap();
    setAnswers([...answers, '']);
  }

  const problem = fieldMessage(problems, 'acceptedAnswers');

  return (
    <View className="gap-md">
      <View className="gap-xs">
        <View className="gap-3xs">
          <Text className="text-label-md font-semibold text-fg-1">
            Đáp án chấp nhận · {answers.length}/{limits.acceptedAnswersMax}
          </Text>
          <Text className="text-caption-sm text-fg-2">
            Gõ đáp án rồi bấm Enter để thêm một cách viết khác.
          </Text>
        </View>
        {answers.map((answer, index) => (
          <AnimatedRow
            key={index}
            animate={index >= initialCount}
            className="flex-row items-start gap-xs"
            exit={false}
          >
            <View className="flex-1">
              <Input
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                accessibilityLabel={`Đáp án chấp nhận ${index + 1}`}
                maxLength={limits.acceptedAnswerMax}
                placeholder="Ví dụ: Hà Nội"
                returnKeyType={index < answers.length - 1 || canAdd ? 'next' : 'done'}
                submitBehavior={index < answers.length - 1 || canAdd ? 'submit' : 'blurAndSubmit'}
                value={answer}
                onChangeText={(text) =>
                  setAnswers(answers.map((value, i) => (i === index ? text : value)))
                }
                onSubmitEditing={() => submitFrom(index)}
              />
            </View>
            <Button
              accessibilityLabel={`Xoá đáp án ${index + 1}`}
              disabled={answers.length <= 1}
              iconLeft="delete"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => setAnswers(answers.filter((_, i) => i !== index))}
            />
          </AnimatedRow>
        ))}
        {problem ? <Text className="text-caption-sm text-error">{problem}</Text> : null}
        <Button
          disabled={!canAdd}
          iconLeft="add"
          label="Thêm đáp án"
          size="sm"
          variant="secondary"
          onPress={() => setAnswers([...answers, ''])}
        />
      </View>
      <MatchModeField value={item.matchMode} onChange={(matchMode) => onChange({ matchMode })} />
    </View>
  );
}
