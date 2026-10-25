import dayjs from 'dayjs';
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { View } from 'react-native';

import { Toggle } from '@/shared/ui/toggle';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import type { PollFormValues } from '../../schemas/poll.schemas';
import { DateTimeFields } from '../when/DateTimeFields';

export interface PollDeadlineFieldsProps {
  control: Control<PollFormValues>;
  setValue: UseFormSetValue<PollFormValues>;
  /** `limits.poll.closesInMaxDays`. */
  maxDays: number;
  disabled?: boolean;
  /** Lỗi từ BE gắn vào ô giờ (`POLL_002`) — hiện cùng lỗi kiểm ở client. */
  serverTimeError?: string;
}

/**
 * "Hạn chốt" của khảo sát: công tắc bật/tắt + ngày/giờ khi bật (app.md §3). Bật lần đầu tự điền "sáng mai 09:00" — người dùng sửa được — thay vì hai ô trống buộc phải chọn cả hai
 * trước khi hiểu mình vừa bật gì. Lỗi (thiếu ngày/giờ, ngoài cửa sổ) gắn dưới ĐÚNG ô, do schema (`deadlineDate`/`deadlineTime`); `POLL_002` từ BE hiện dưới ô giờ.
 */
export function PollDeadlineFields({ control, setValue, maxDays, disabled = false, serverTimeError }: PollDeadlineFieldsProps) {
  return (
    <Controller
      control={control}
      name="deadlineOn"
      render={({ field: { value: on, onChange } }) => (
        <View className="gap-sm">
          <Toggle
            description="Sau thời điểm này mọi người không bầu thêm được"
            disabled={disabled}
            label="Đặt hạn chốt"
            value={on}
            onChange={(next) => {
              onChange(next);
              if (next) {
                // Bật ⇒ điền mặc định "sáng mai 09:00" (mỗi lần bật, kể cả bật lại sau khi tắt — mặc định luôn hợp lệ, khác một mốc cũ có thể đã qua).
                setValue('deadlineDate', dayjs(serverNowMs()).add(1, 'day').startOf('day').toDate(), { shouldValidate: false });
                setValue('deadlineTime', '09:00', { shouldValidate: false });
              }
            }}
          />
          {on ? (
            <Controller
              control={control}
              name="deadlineDate"
              render={({ field: date, fieldState: dateState }) => (
                <Controller
                  control={control}
                  name="deadlineTime"
                  render={({ field: time, fieldState: timeState }) => (
                    <DateTimeFields
                      date={date.value}
                      dateError={dateState.error?.message}
                      maxDate={dayjs(serverNowMs()).add(maxDays, 'day').toDate()}
                      minDate={new Date(serverNowMs())}
                      time={time.value}
                      timeError={timeState.error?.message ?? serverTimeError}
                      onChangeDate={date.onChange}
                      onChangeTime={time.onChange}
                    />
                  )}
                />
              )}
            />
          ) : null}
        </View>
      )}
    />
  );
}
