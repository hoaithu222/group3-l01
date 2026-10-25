import { Text, View } from 'react-native';
import type { Control } from 'react-hook-form';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';

import type { UpdateWorkspaceFormValues } from '../schemas/workspace.schemas';

export interface WorkspaceDetailsCardProps {
  control: Control<UpdateWorkspaceFormValues>;
  /** Form đã khác bản server (`formState.isDirty`) — chưa sửa gì thì "Lưu thay đổi" khoá, không gửi một PATCH rỗng. */
  dirty: boolean;
  disabled: boolean;
  loading: boolean;
  nameMax: number;
  descriptionMax: number;
  onSave: () => void;
}

/** Thẻ "Thông tin nhóm" (tên + mô tả) trong `WorkspaceSettingsScreen` — tách riêng để giữ màn dưới trần 200 dòng. */
export function WorkspaceDetailsCard({
  control,
  dirty,
  disabled,
  loading,
  nameMax,
  descriptionMax,
  onSave,
}: WorkspaceDetailsCardProps) {
  return (
    <Section icon="edit" title="Thông tin nhóm">
      <Card>
        <View className="gap-md">
          <FormInput<UpdateWorkspaceFormValues>
            control={control}
            disabled={disabled}
            label="Tên nhóm"
            maxLength={nameMax}
            name="name"
            placeholder="Ví dụ: Nhóm dự án A"
            required
          />
          <FormInput<UpdateWorkspaceFormValues>
            control={control}
            disabled={disabled}
            label="Mô tả"
            maxLength={descriptionMax}
            multiline
            name="description"
            placeholder="Nhóm này dùng để làm gì? (không bắt buộc)"
          />
          {/* ⛔ `pressableClassName="self-center"` mới căn giữa được: lớp nhận chạm của `Button` mặc định `self-start` (ôm sát nhãn, dạt
              trái), và `alignSelf` của chính nút thắng mọi `items-center` đặt ở `View` cha. Cùng cách với hai nút ở thẻ "Ảnh nhóm". */}
          {/* ⚠️ Khoá khi CHƯA sửa gì: bản cũ luôn bấm được ⇒ gửi một PATCH không đổi gì rồi vẫn báo "Đã lưu thay đổi" cho một việc
              không xảy ra. Dòng chữ nói vì sao nút khoá (trạng thái không chỉ bằng màu nút). */}
          {!dirty && !disabled ? (
            <Text className="text-center text-caption-lg text-fg-2">Chưa có thay đổi nào để lưu.</Text>
          ) : null}
          <Button
            disabled={disabled || !dirty}
            label="Lưu thay đổi"
            loading={loading}
            pressableClassName="self-center"
            onPress={onSave}
          />
        </View>
      </Card>
    </Section>
  );
}
