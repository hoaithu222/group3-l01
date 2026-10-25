import { useEffect } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { FormInput } from '@/shared/ui/input';

import type { WorkspaceOption } from '../../api/meetings.types';
import { AGENDA_MAX, TITLE_MAX } from '../../constants/meetings.constants';
import type { MeetingFormValues } from '../../schemas/meeting-form.schema';
import { ChipField } from './ChipField';
import type { MeetingFormApi } from './meeting-form.types';

export interface MeetingBasicSectionProps {
  form: MeetingFormApi;
  /** Chỉ khi TẠO (chọn nhóm) — sửa thì không đổi nhóm. */
  workspaces?: readonly WorkspaceOption[];
}

/**
 * Phần cơ bản: tiêu đề, nhóm (khi tạo từ tab Lịch), nội dung/agenda. Chỉ ở trong MỘT nhóm thì chọn sẵn nhóm đó — không bắt người dùng
 * chạm vào một lựa chọn duy nhất (và khối "Người tham dự" có danh sách để chọn ngay).
 */
export function MeetingBasicSection({ form, workspaces }: MeetingBasicSectionProps) {
  const { control, setValue } = form;
  const workspaceId = useWatch({ control, name: 'workspaceId' });
  const onlyId = workspaces?.length === 1 ? workspaces[0]?.id : undefined;
  useEffect(() => {
    if (onlyId && !workspaceId) setValue('workspaceId', onlyId);
  }, [onlyId, workspaceId, setValue]);

  return (
    <View className="gap-md">
      <FormInput<MeetingFormValues>
        control={control}
        label="Tiêu đề"
        maxLength={TITLE_MAX}
        name="title"
        placeholder="Ví dụ: Họp sprint tuần 12"
        required
      />
      {workspaces ? (
        workspaces.length === 0 ? (
          <Text className="text-body-md text-fg-2">
            Bạn chưa ở trong nhóm nào có thể tạo cuộc họp. Hãy tham gia hoặc tạo một nhóm trước.
          </Text>
        ) : (
          <Controller
            control={control}
            name="workspaceId"
            render={({ field, fieldState }) => (
              <ChipField
                label="Nhóm"
                labels={Object.fromEntries(workspaces.map((w) => [w.id, w.name]))}
                message={fieldState.error?.message}
                options={workspaces.map((w) => w.id)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        )
      ) : null}
      <FormInput<MeetingFormValues>
        control={control}
        label="Nội dung"
        maxLength={AGENDA_MAX}
        multiline
        name="agenda"
        placeholder="Nội dung chính cần trao đổi trong cuộc họp"
      />
    </View>
  );
}
