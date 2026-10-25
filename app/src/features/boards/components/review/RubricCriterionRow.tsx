import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import type { RubricDraft, RubricPatch } from '../../utils/rubric-draft';

export interface RubricCriterionRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  descriptionMax: number;
  disabled: boolean;
  draft: RubricDraft;
  index: number;
  labelMax: number;
  onChange: (patch: RubricPatch) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * MỘT tiêu chí trong `RubricBuilder` (p4-05 app.md §2): tên · mô tả (tuỳ chọn) · điểm tối đa · Lên/Xuống/Xoá. Sắp xếp bằng nút Lên/Xuống
 * chứ không kéo thả — dùng được bằng một tay và trình đọc màn hình (cùng lý do `ColumnEditorRow`).
 *
 * Ô tên/mô tả/điểm là UNCONTROLLED (`defaultValue`, key theo `draft.key`) — cùng luật IME-safe với ô tìm kiếm: ghi đè `value` giữa lúc
 * bộ gõ Telex đang ghép dấu làm mất dấu trên Android.
 */
export function RubricCriterionRow({
  canMoveDown,
  canMoveUp,
  descriptionMax,
  disabled,
  draft,
  index,
  labelMax,
  onChange,
  onMove,
  onRemove,
}: RubricCriterionRowProps) {
  const position = index + 1;

  return (
    <View className="gap-xs rounded-sm border-hairline border-border-1 bg-bg-1 p-sm">
      <View className="flex-row items-center gap-xs">
        <Text className="text-label-md font-semibold text-fg-2">{`${position}.`}</Text>
        <View className="flex-1">
          <Input
            accessibilityLabel={`Tên tiêu chí ${position}`}
            defaultValue={draft.label}
            disabled={disabled}
            maxLength={labelMax}
            placeholder="Tên tiêu chí (vd: Nội dung)"
            onChangeText={(label) => onChange({ label })}
          />
        </View>
      </View>

      <Input
        accessibilityLabel={`Mô tả tiêu chí ${position}`}
        defaultValue={draft.description}
        disabled={disabled}
        maxLength={descriptionMax}
        multiline
        placeholder="Mô tả cách chấm (không bắt buộc)"
        onChangeText={(description) => onChange({ description })}
      />

      <View className="flex-row items-center gap-xs">
        <View className="flex-1">
          <Input
            accessibilityLabel={`Điểm tối đa tiêu chí ${position}`}
            defaultValue={draft.maxScore}
            digitsOnly
            disabled={disabled}
            hint="điểm tối đa"
            keyboardType="number-pad"
            maxLength={3}
            placeholder="Điểm tối đa"
            onChangeText={(maxScore) => onChange({ maxScore })}
          />
        </View>
        <Button
          accessibilityLabel={`Đưa tiêu chí ${position} lên`}
          disabled={disabled || !canMoveUp}
          iconLeft="arrow-up-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onMove(-1)}
        />
        <Button
          accessibilityLabel={`Đưa tiêu chí ${position} xuống`}
          disabled={disabled || !canMoveDown}
          iconLeft="arrow-down-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onMove(1)}
        />
        <Button
          accessibilityLabel={`Xoá tiêu chí ${position}`}
          disabled={disabled}
          iconLeft="delete"
          iconOnly
          size="sm"
          variant="danger-secondary"
          onPress={onRemove}
        />
      </View>
    </View>
  );
}
