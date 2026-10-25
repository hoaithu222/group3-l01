import { Text, View } from 'react-native';
import { useFieldArray, type Control } from 'react-hook-form';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';

import type { ProfileFormValues } from '../../schemas/portfolio.schemas';

export interface LinksEditorProps {
  control: Control<ProfileFormValues>;
  /** `limits.linksMax`. */
  max: number;
  labelMax: number;
  urlMax: number;
  disabled?: boolean;
}

/**
 * Danh sách liên kết liên hệ (app.md p6-07 §3 "Thông tin", `FieldArray`): tối đa `linksMax`, mỗi liên kết có tên + địa chỉ `https://`. Địa chỉ `http:`/`javascript:`/có tài khoản
 * (`https://a@b.com`) bị chặn ở form và BE cũng bỏ khỏi trang công khai (CR-33) — không có "liên kết nguy hiểm" nào tới được người xem.
 */
export function LinksEditor({
  control,
  disabled = false,
  labelMax,
  max,
  urlMax,
}: LinksEditorProps) {
  const { append, fields, remove } = useFieldArray({ control, name: 'links' });

  return (
    <View className="gap-sm">
      <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
        {`Liên kết liên hệ (${fields.length}/${max})`}
      </Text>
      {fields.map((field, index) => (
        <Card key={field.id}>
          <View className="gap-sm">
            <FormInput
              control={control}
              disabled={disabled}
              label="Tên liên kết"
              maxLength={labelMax}
              name={`links.${index}.label`}
              placeholder="Ví dụ: GitHub"
              returnKeyType="next"
            />
            <FormInput
              autoCapitalize="none"
              autoCorrect={false}
              control={control}
              disabled={disabled}
              keyboardType="url"
              label="Địa chỉ"
              maxLength={urlMax}
              name={`links.${index}.url`}
              placeholder="https://github.com/ten-ban"
              returnKeyType="done"
            />
            <Button
              accessibilityLabel={`Xoá liên kết ${index + 1}`}
              disabled={disabled}
              iconLeft="delete"
              label="Xoá liên kết"
              size="sm"
              variant="tertiary"
              onPress={() => remove(index)}
            />
          </View>
        </Card>
      ))}
      <Button
        disabled={disabled || fields.length >= max}
        iconLeft="add"
        label={fields.length >= max ? `Đã đạt tối đa ${max} liên kết` : 'Thêm liên kết'}
        variant="secondary"
        onPress={() => append({ label: '', url: 'https://' })}
      />
    </View>
  );
}
