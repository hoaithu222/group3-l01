import { Text, View } from 'react-native';
import { useFieldArray, type Control } from 'react-hook-form';

import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import type { PollFormValues } from '../../schemas/poll.schemas';

export interface PollOptionsEditorProps {
  control: Control<PollFormValues>;
  /** `limits.poll.optionsMin` / `optionsMax`. */
  min: number;
  max: number;
  optionMax: number;
  disabled?: boolean;
}

/**
 * Danh sách lựa chọn của khảo sát (RHF `useFieldArray`): luôn giữ số dòng trong `[min, max]` — nút xoá ẩn khi chạm sàn, nút "Thêm lựa chọn" ẩn khi chạm trần (app.md §3: "quá
 * `optionsMax` ẩn nút thêm"). Mỗi dòng bắt buộc điền, không trùng (schema `poll.schemas.ts` gắn lỗi vào ĐÚNG dòng). "Tiếp" trên bàn phím nhảy sang dòng kế; ở dòng cuối thì THÊM dòng
 * mới (nếu còn chỗ) rồi nhảy vào đó — Enter ở ô lựa chọn chuyển ô kế / thêm ô mới (app.md §7).
 */
export function PollOptionsEditor({ control, min, max, optionMax, disabled = false }: PollOptionsEditorProps) {
  const { append, fields, remove } = useFieldArray({ control, name: 'options' });
  const canAdd = fields.length < max;

  return (
    <View className="gap-xs">
      <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
        {`Lựa chọn (${fields.length}/${max})`}
      </Text>
      {fields.map((field, index) => (
        <View key={field.id} className="flex-row items-start gap-xs">
          <FormInput
            accessibilityLabel={`Lựa chọn ${index + 1}`}
            className="flex-1"
            control={control}
            disabled={disabled}
            maxLength={optionMax * 4}
            name={`options.${index}.text`}
            placeholder={`Lựa chọn ${index + 1}`}
            returnKeyType={index === fields.length - 1 && canAdd ? 'next' : 'done'}
            submitBehavior="submit"
            onSubmitEditing={() => {
              if (index === fields.length - 1 && canAdd) append({ text: '' }, { shouldFocus: true });
            }}
          />
          {fields.length > min ? (
            <Button
              accessibilityLabel={`Xoá lựa chọn ${index + 1}`}
              disabled={disabled}
              iconLeft="delete"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => remove(index)}
            />
          ) : null}
        </View>
      ))}
      {canAdd ? (
        <Button
          disabled={disabled}
          iconLeft="add"
          label="Thêm lựa chọn"
          size="sm"
          variant="secondary"
          onPress={() => append({ text: '' }, { shouldFocus: true })}
        />
      ) : null}
    </View>
  );
}
