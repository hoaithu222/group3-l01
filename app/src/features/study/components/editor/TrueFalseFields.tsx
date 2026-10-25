import { Text, View } from 'react-native';

import type { DraftItem } from '../../utils/editor-draft';
import { hapticTap } from '../../utils/editor-haptics';
import { SelectCard } from './SelectCard';

export interface TrueFalseFieldsProps {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
}

/**
 * Đúng / Sai — hai thẻ chọn lớn cạnh nhau: dấu tích ↔ dấu chéo + CHỮ "Đúng"/"Sai" + vòng chọn đặc (không chỉ màu xanh/đỏ). Thẻ
 * to (cao 128dp) vì đây là quyết định duy nhất của dạng này — chạm trượt sang thẻ kia là sai đáp án mà không ai hay.
 */
export function TrueFalseFields({ item, onChange }: TrueFalseFieldsProps) {
  const choose = (correct: boolean) => {
    hapticTap();
    onChange({ correct });
  };
  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Đáp án đúng</Text>
      <View
        accessibilityLabel="Đáp án đúng"
        accessibilityRole="radiogroup"
        className="flex-row gap-sm"
      >
        <View className="flex-1">
          <SelectCard
            icon="checkmark-circle"
            label="Đúng"
            layout="stacked"
            selected={item.correct}
            tone="success"
            onPress={() => choose(true)}
          />
        </View>
        <View className="flex-1">
          <SelectCard
            icon="clear-circle"
            label="Sai"
            layout="stacked"
            selected={!item.correct}
            tone="danger"
            onPress={() => choose(false)}
          />
        </View>
      </View>
    </View>
  );
}
