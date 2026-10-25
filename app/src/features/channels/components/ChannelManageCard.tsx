import { View } from 'react-native';
import type { Control } from 'react-hook-form';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';

import type { UpdateChannelFormValues } from '../schemas/channel.schemas';

export interface ChannelManageCardProps {
  adminsOnly: boolean;
  control: Control<UpdateChannelFormValues>;
  descriptionMax: number;
  disabled: boolean;
  loading: boolean;
  nameMax: number;
  onAdminsOnlyChange: (value: boolean) => void;
  onSave: () => void;
}

/** Khối "Quản lý" — sửa tên/mô tả/policy (app.md §3), tách khỏi chat (app.md §7). Tiêu đề nằm NGOÀI thẻ (`Section`). */
export function ChannelManageCard({
  adminsOnly,
  control,
  descriptionMax,
  disabled,
  loading,
  nameMax,
  onAdminsOnlyChange,
  onSave,
}: ChannelManageCardProps) {
  return (
    <Section icon="setting" title="Quản lý">
      <Card>
        <View className="gap-md">
          <FormInput<UpdateChannelFormValues>
            control={control}
            disabled={disabled}
            label="Tên kênh"
            maxLength={nameMax}
            name="name"
            placeholder="Ví dụ: chung, thông-báo"
            required
          />
          <FormInput<UpdateChannelFormValues>
            control={control}
            disabled={disabled}
            label="Mô tả"
            maxLength={descriptionMax}
            multiline
            name="description"
            placeholder="Kênh này dùng để làm gì? (không bắt buộc)"
          />
          <Toggle
            description="Thành viên khác chỉ đọc, không gửi được tin nhắn mới."
            disabled={disabled}
            label="Chỉ quản trị đăng bài"
            value={adminsOnly}
            onChange={onAdminsOnlyChange}
          />
          <Button disabled={disabled} label="Lưu thay đổi" loading={loading} onPress={onSave} />
        </View>
      </Card>
    </Section>
  );
}
