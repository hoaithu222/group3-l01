import { Controller, type Control } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';

import { REMINDER_OPTIONS, REMINDERS_MAX, reminderLabel } from '../../constants/meetings.constants';
import type { MeetingFormValues } from '../../schemas/meeting-form.schema';

/** Nhắc lịch: chọn tối đa `REMINDERS_MAX` mốc (phút trước giờ họp). Đủ mốc thì các chip chưa chọn bị khoá — khớp BE. */
export function MeetingReminderField({ control }: { control: Control<MeetingFormValues> }) {
  return (
    <Controller
      control={control}
      name="reminderMinutes"
      render={({ field, fieldState }) => {
        const value = field.value;
        const toggle = (minutes: number) =>
          field.onChange(
            value.includes(minutes)
              ? value.filter((m) => m !== minutes)
              : [...value, minutes].sort((a, b) => a - b),
          );
        return (
          <View className="gap-2xs">
            <Text className="text-label-md font-semibold text-fg-1">Nhắc trước</Text>
            <View className="flex-row flex-wrap gap-xs">
              {REMINDER_OPTIONS.map((minutes) => {
                const selected = value.includes(minutes);
                return (
                  <Chip
                    key={minutes}
                    disabled={!selected && value.length >= REMINDERS_MAX}
                    label={reminderLabel(minutes)}
                    role="checkbox"
                    selected={selected}
                    onPress={() => toggle(minutes)}
                  />
                );
              })}
            </View>
            {fieldState.error ? (
              <Text className="text-caption-sm text-error">{fieldState.error.message}</Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}
