import { Controller, type Control } from 'react-hook-form';
import { View } from 'react-native';

import { CRON_WEEKDAYS } from '../constants/wallet.constants';
import { timezoneOptions } from '../domain/reminder-cron';
import type { WalletSettingsFormValues } from '../schemas/wallet-forms.schemas';
import { OptionSelect } from './OptionSelect';

export interface ReminderScheduleFieldsProps {
  control: Control<WalletSettingsFormValues>;
  disabled?: boolean;
  /** Múi giờ đang lưu — luôn có mặt trong danh sách dù nằm ngoài bộ gọn. */
  timezone: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  label: `${String(hour).padStart(2, '0')} giờ`,
  value: String(hour),
}));

/** Phút theo bước 15 (đủ dùng cho lịch nhắc); phút đang lưu (vd 07 do BE đặt) vẫn hiện được. */
function minuteOptions(current: number) {
  const steps = [0, 15, 30, 45];
  const all = steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
  return all.map((minute) => ({
    label: `${String(minute).padStart(2, '0')} phút`,
    value: String(minute),
  }));
}

/**
 * Lịch nhắc HẰNG TUẦN: thứ + giờ + phút + múi giờ (UI chọn rời, gộp thành cron `m h * * d` lúc gửi —
 * BE chỉ nhận dạng đó). Mặc định 09:00 thứ Sáu, múi giờ hiện tại của nhóm.
 */
export function ReminderScheduleFields({
  control,
  disabled,
  timezone,
}: ReminderScheduleFieldsProps) {
  return (
    <View className="gap-md">
      <Controller
        control={control}
        name="weekday"
        render={({ field }) => (
          <OptionSelect
            disabled={disabled}
            label="Ngày trong tuần"
            options={CRON_WEEKDAYS.map((day) => ({ label: day.label, value: String(day.value) }))}
            placeholder="Chọn ngày trong tuần"
            value={String(field.value)}
            onChange={(value) => field.onChange(Number(value))}
          />
        )}
      />

      <View className="flex-row gap-sm">
        <View className="flex-1">
          <Controller
            control={control}
            name="hour"
            render={({ field }) => (
              <OptionSelect
                disabled={disabled}
                label="Giờ"
                options={HOURS}
                placeholder="Chọn giờ"
                value={String(field.value)}
                onChange={(value) => field.onChange(Number(value))}
              />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="minute"
            render={({ field }) => (
              <OptionSelect
                disabled={disabled}
                label="Phút"
                options={minuteOptions(field.value)}
                placeholder="Chọn phút"
                value={String(field.value)}
                onChange={(value) => field.onChange(Number(value))}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="timezone"
        render={({ field, fieldState }) => (
          <OptionSelect
            disabled={disabled}
            label="Múi giờ"
            message={fieldState.error?.message}
            options={timezoneOptions(timezone).map((zone) => ({ label: zone, value: zone }))}
            placeholder="Chọn múi giờ"
            searchable
            searchPlaceholder="Tìm múi giờ"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </View>
  );
}
