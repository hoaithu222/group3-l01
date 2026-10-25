import { Text, View } from 'react-native';
import { useFieldArray, type Control } from 'react-hook-form';

import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import type { ProjectFormValues } from '../../schemas/portfolio-project.schemas';

export interface HighlightsEditorProps {
  control: Control<ProjectFormValues>;
  /** `limits.highlightsMax` (3). */
  max: number;
  /** `limits.highlightMax` (160 grapheme mỗi điểm). */
  itemMax: number;
  disabled?: boolean;
}

/** Tối đa `highlightsMax` "điểm nổi bật" của dự án (app.md p6-07 §3): mỗi điểm là một câu ngắn hiện trên trang ("Xây dựng luồng đăng nhập cho 2.000 người dùng"). */
export function HighlightsEditor({
  control,
  disabled = false,
  itemMax,
  max,
}: HighlightsEditorProps) {
  const { append, fields, remove } = useFieldArray({ control, name: 'highlights' });

  return (
    <View className="gap-sm">
      <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
        {`Điểm nổi bật (${fields.length}/${max})`}
      </Text>
      {fields.map((field, index) => (
        <View key={field.id} className="gap-xs">
          <FormInput
            control={control}
            disabled={disabled}
            label={`Điểm nổi bật ${index + 1}`}
            message={`Tối đa ${itemMax} ký tự`}
            name={`highlights.${index}.text`}
            placeholder="Một câu ngắn về đóng góp nổi bật của bạn"
          />
          <View className="items-start">
            <Button
              accessibilityLabel={`Xoá điểm nổi bật ${index + 1}`}
              disabled={disabled}
              iconLeft="delete"
              label="Xoá"
              size="xs"
              variant="tertiary"
              onPress={() => remove(index)}
            />
          </View>
        </View>
      ))}
      <Button
        disabled={disabled || fields.length >= max}
        iconLeft="add"
        label={fields.length >= max ? `Đã đạt tối đa ${max} điểm nổi bật` : 'Thêm điểm nổi bật'}
        variant="secondary"
        onPress={() => append({ text: '' })}
      />
    </View>
  );
}
