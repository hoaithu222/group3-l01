import type { UseFormReturn } from 'react-hook-form';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';

import { JOB_LIMITS } from '../../constants/recruiter.constants';
import type { JobProfileValues } from '../../schemas/career-settings.schemas';
import { PreferredRolesEditor } from './PreferredRolesEditor';

export interface JobProfileFieldsProps {
  dirty: boolean;
  disabled: boolean;
  form: UseFormReturn<JobProfileValues, unknown, JobProfileValues>;
  roles: string[];
  saving: boolean;
  onRolesChange: (roles: string[]) => void;
  onSave: () => void;
}

/**
 * Hồ sơ Tìm việc (app.md §3): tiêu đề ≤ 120, vị trí mong muốn (chip ≤ 5), khu vực ≤ 60 + nút Lưu. "Lưu" chỉ sáng khi có thay đổi và không offline. Lỗi Zod hiện tại trường
 * khi rời ô (`onTouched`). Để trống = không chia sẻ trường đó (gửi `null`, không gửi chuỗi rỗng).
 */
export function JobProfileFields({
  dirty,
  disabled,
  form,
  onRolesChange,
  onSave,
  roles,
  saving,
}: JobProfileFieldsProps) {
  return (
    <Card title="Hồ sơ Tìm việc">
      <View className="gap-md">
        <FormInput<JobProfileValues>
          control={form.control}
          disabled={disabled}
          hint="Một dòng giới thiệu bạn với doanh nghiệp"
          label="Tiêu đề"
          maxLength={JOB_LIMITS.headlineMax}
          name="headline"
          placeholder="Ví dụ: Sinh viên năm 4 CNTT, thích làm frontend"
        />
        <PreferredRolesEditor disabled={disabled} value={roles} onChange={onRolesChange} />
        <FormInput<JobProfileValues>
          control={form.control}
          disabled={disabled}
          label="Khu vực"
          maxLength={JOB_LIMITS.locationMax}
          name="location"
          placeholder="Ví dụ: TP. Hồ Chí Minh"
        />
        <Button
          disabled={disabled || !dirty}
          fullWidth
          label="Lưu thay đổi"
          loading={saving}
          variant="secondary"
          onPress={onSave}
        />
      </View>
    </Card>
  );
}
