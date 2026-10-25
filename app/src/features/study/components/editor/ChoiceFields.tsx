import { useEffect, useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { StudyLimits } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';
import { addOption, removeOption, setOptionText, toggleCorrect } from '../../utils/editor-ops';
import { hapticTap } from '../../utils/editor-haptics';
import type { ItemProblem } from '../../utils/item-validation';
import { itemSlotScopeKey, setSlotAsset } from '../../utils/media-slots';
import { ChoiceOptionRow } from './ChoiceOptionRow';
import { fieldMessage } from './field-message';

export interface ChoiceFieldsProps {
  item: DraftItem;
  limits: StudyLimits;
  problems: readonly ItemProblem[];
  /** Khoá ô ảnh của từng lựa chọn trong hàng đợi upload (bộ + mục + lựa chọn). */
  setId: string;
  onChange: (update: (item: DraftItem) => DraftItem) => void;
}

/**
 * Lựa chọn của MULTIPLE_CHOICE (đúng MỘT) / MULTI_SELECT (≥ 1) — thêm/bớt 2–6, đánh dấu đáp án đúng bằng MỘT cú chạm vào nút tròn
 * (dấu tích đặc + chữ "Đáp án đúng", không chỉ màu xanh — app.md p4-01 §7).
 *
 * Gõ nhanh: Enter ở một lựa chọn nhảy sang lựa chọn kế; ở lựa chọn CUỐI thì thêm lựa chọn mới (nếu chưa chạm trần) và đặt con trỏ
 * vào đó — nhập bốn phương án chỉ cần gõ + Enter, không phải với tay bấm "Thêm lựa chọn".
 */
export function ChoiceFields({ item, limits, onChange, problems, setId }: ChoiceFieldsProps) {
  const single = item.type === 'MULTIPLE_CHOICE';
  const correctProblem = fieldMessage(problems, 'correct') ?? fieldMessage(problems, 'options');
  const count = item.options.length;
  const canAdd = count < limits.optionsMax;

  const inputs = useRef(new Map<string, TextInput>());
  const focusNewest = useRef(false);
  // Khoá lựa chọn có SẴN lúc mở form: chỉ lựa chọn thêm SAU đó mới chạy hiệu ứng hiện dần.
  const [initialKeys] = useState(() => new Set(item.options.map((option) => option.key)));

  // Lựa chọn vừa thêm bằng Enter: chờ nó vào cây rồi mới đặt con trỏ (ref của nó chưa có ở lúc bấm).
  useEffect(() => {
    if (!focusNewest.current) return;
    focusNewest.current = false;
    const newest = item.options[count - 1];
    if (newest) inputs.current.get(newest.key)?.focus();
  }, [count, item.options]);

  function add(): void {
    onChange((current) => addOption(current, limits.optionsMax));
  }

  function submitFrom(index: number): void {
    const next = item.options[index + 1];
    if (next) inputs.current.get(next.key)?.focus();
    else if (canAdd) {
      focusNewest.current = true;
      hapticTap();
      add();
    }
  }

  return (
    <View className="gap-xs">
      <View className="gap-3xs">
        <Text className="text-label-md font-semibold text-fg-1">
          Các lựa chọn · {count}/{limits.optionsMax}
        </Text>
        <Text className="text-caption-sm text-fg-2">
          {single
            ? 'Chạm vòng tròn bên trái để chọn MỘT đáp án đúng.'
            : 'Chạm vòng tròn bên trái để chọn MỌI đáp án đúng.'}
        </Text>
      </View>

      {item.options.map((option, index) => (
        <ChoiceOptionRow
          key={option.key}
          animate={!initialKeys.has(option.key)}
          correct={item.correctKeys.includes(option.key)}
          index={index}
          inputRef={(node) => {
            if (node) inputs.current.set(option.key, node);
            else inputs.current.delete(option.key);
          }}
          keepGoing={index < count - 1 || canAdd}
          maxLength={limits.optionTextMax}
          message={fieldMessage(problems, `options.${index}.text`)}
          option={option}
          removable={count > limits.optionsMin}
          scopeKey={itemSlotScopeKey(setId, item.clientItemKey, {
            kind: 'option',
            optionKey: option.key,
          })}
          single={single}
          onChangeText={(text) => onChange((current) => setOptionText(current, option.key, text))}
          onClearMedia={() =>
            onChange((current) =>
              setSlotAsset(current, { kind: 'option', optionKey: option.key }, null),
            )
          }
          onRemove={() =>
            onChange((current) => removeOption(current, option.key, limits.optionsMin))
          }
          onSubmit={() => submitFrom(index)}
          onToggle={() => {
            hapticTap();
            onChange((current) => toggleCorrect(current, option.key));
          }}
        />
      ))}

      {correctProblem ? <Text className="text-caption-sm text-error">{correctProblem}</Text> : null}

      <Button
        disabled={!canAdd}
        iconLeft="add"
        label="Thêm lựa chọn"
        size="sm"
        variant="secondary"
        onPress={add}
      />
    </View>
  );
}
