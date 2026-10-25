import dayjs from 'dayjs';
import { Controller, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { DatePicker } from '@/shared/ui/date-picker';
import { TimePicker } from '@/shared/ui/time-picker';

import { DURATION_PRESETS } from '../../constants/meetings.constants';
import { addMinutesToTime, minutesBetween } from '../../utils/meeting-duration.utils';
import { fromDayKey, toDayKey } from '../../utils/meeting-time.utils';
import type { MeetingFormApi } from './meeting-form.types';
import { MeetingTimezoneField } from './MeetingTimezoneField';

export interface MeetingWhenFieldsProps {
  form: MeetingFormApi;
  /** Họp đang diễn ra (`canEditLimited`): chỉ sửa được giờ KẾT THÚC — ngày/giờ bắt đầu/múi giờ khoá (BE từ chối nếu gửi). */
  startLocked?: boolean;
}

/**
 * Ngày + giờ bắt đầu/kết thúc + múi giờ. Giá trị là giờ ĐỒNG HỒ TƯỜNG theo múi giờ của cuộc họp — đổi sang UTC ở
 * `meeting-form-payload` (một chỗ). Bước phút 5 cho `TimePicker`. Thời lượng nhanh (30/45/60/90 phút) đặt giờ kết thúc = giờ bắt
 * đầu + N; chip nào làm cuộc họp qua nửa đêm thì khoá (form chỉ nhận họp trong một ngày).
 */
export function MeetingWhenFields({ form, startLocked = false }: MeetingWhenFieldsProps) {
  const { control, setValue } = form;
  const startTime = useWatch({ control, name: 'startTime' });
  const endTime = useWatch({ control, name: 'endTime' });
  const duration = minutesBetween(startTime, endTime);

  return (
    <View className="gap-sm">
      <Controller
        control={control}
        name="date"
        render={({ field, fieldState }) => (
          <DatePicker
            disabled={startLocked}
            error={fieldState.error?.message}
            label="Ngày họp"
            minDate={startLocked ? undefined : dayjs().startOf('day').toDate()}
            value={field.value ? fromDayKey(field.value) : null}
            onChange={(date: Date) => field.onChange(toDayKey(date))}
          />
        )}
      />
      <View className="flex-row gap-sm">
        <Controller
          control={control}
          name="startTime"
          render={({ field, fieldState }) => (
            <TimePicker
              className="flex-1"
              disabled={startLocked}
              error={fieldState.error?.message}
              label="Bắt đầu"
              minuteStep={5}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="endTime"
          render={({ field, fieldState }) => (
            <TimePicker
              className="flex-1"
              error={fieldState.error?.message}
              label="Kết thúc"
              minuteStep={5}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </View>
      <View className="gap-2xs">
        <Text className="text-label-md text-fg-1">Thời lượng nhanh</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-xs">
          {DURATION_PRESETS.map((minutes) => {
            const next = addMinutesToTime(startTime, minutes);
            return (
              <Chip
                key={minutes}
                disabled={next === null}
                label={`${String(minutes)} phút`}
                role="radio"
                selected={duration === minutes}
                onPress={() =>
                  next && setValue('endTime', next, { shouldDirty: true, shouldValidate: true })
                }
              />
            );
          })}
        </View>
      </View>
      <MeetingTimezoneField control={control} disabled={startLocked} />
    </View>
  );
}
