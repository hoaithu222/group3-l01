import { useState } from 'react';
import { type Control, Controller } from 'react-hook-form';
import { Text } from 'react-native';

import { Select, SelectSheet } from '@/shared/ui/select';

import type { MeetingFormValues } from '../../schemas/meeting-form.schema';
import { timezoneLabel, timezoneOptions } from '../../utils/meeting-zone.utils';
import { deviceTimeZone } from '../../utils/meeting-time.utils';

export interface MeetingTimezoneFieldProps {
  control: Control<MeetingFormValues>;
  /** Họp đang diễn ra: BE không cho đổi múi giờ (kéo theo giờ bắt đầu). */
  disabled?: boolean;
}

/**
 * Múi giờ của cuộc họp (README p2-04 §2 "Múi giờ", app.md §6): mặc định múi giờ THIẾT BỊ, chọn được trong bảng rút gọn (VN, SG, JP, KR,
 * AU, EU, US) có ô tìm. Giờ nhập ở form là giờ ĐỒNG HỒ TƯỜNG theo múi giờ này; mọi người xem giờ THIẾT BỊ của họ + dòng "09:00 giờ Hà
 * Nội" khi khác. Đổi múi giờ giữ nguyên số giờ đã nhập (đổi sang UTC ở `meeting-form-payload`, một chỗ) — vì vậy có dòng nhắc bên dưới.
 */
export function MeetingTimezoneField({ control, disabled }: MeetingTimezoneFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name="timezone"
      render={({ field, fieldState }) => (
        <>
          <Select
            disabled={disabled}
            label="Múi giờ"
            message={fieldState.error?.message}
            placeholder="Chọn múi giờ"
            value={timezoneLabel(field.value)}
            onPress={() => setOpen(true)}
          />
          {field.value !== deviceTimeZone() ? (
            <Text className="text-caption-sm text-fg-2">
              Giờ ở trên là giờ theo múi giờ này; người ở múi giờ khác sẽ thấy giờ quy đổi.
            </Text>
          ) : null}
          <SelectSheet
            options={timezoneOptions(field.value)}
            searchable
            searchPlaceholder="Tìm múi giờ"
            title="Chọn múi giờ"
            value={field.value}
            visible={open}
            onChange={field.onChange}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    />
  );
}
