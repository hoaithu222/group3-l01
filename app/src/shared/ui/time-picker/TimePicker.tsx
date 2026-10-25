import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { BottomSheet } from '../bottom-sheet/BottomSheet';
import { Button } from '../button/Button';
import { datePickerStyles } from '../date-picker/date-picker.styles';
import { TimeColumn } from './TimeColumn';
import {
  HOUR_OPTIONS,
  formatClockTime,
  minuteOptions,
  parseTime,
  snapMinutes,
  type ClockTime,
} from './time-picker.utils';

export interface TimePickerProps {
  className?: string;
  disabled?: boolean;
  /** Câu lỗi dưới ô (vẽ cả trong tấm trượt, cùng cách `DatePicker`). */
  error?: string;
  label?: string;
  /** Bước phút (mặc định 5; phải là ước của 60). */
  minuteStep?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  /** `HH:mm` 24 giờ; rỗng = chưa chọn. */
  value?: string | null;
}

interface SheetBodyProps {
  initial: ClockTime;
  minutes: readonly number[];
  onApply: (time: ClockTime) => void;
}

/** Nội dung tấm trượt — CHỈ dựng khi đang mở nên bản nháp luôn khởi tạo lại từ giá trị hiện tại (cùng cách `Calendar` của DatePicker). */
function TimeSheetBody({ initial, minutes, onApply }: SheetBodyProps) {
  const [draft, setDraft] = useState<ClockTime>(initial);
  return (
    <View className="gap-md">
      <View className="flex-row gap-sm">
        <TimeColumn label="Giờ" options={HOUR_OPTIONS} selected={draft.hours} onSelect={(hours) => setDraft({ ...draft, hours })} />
        <TimeColumn label="Phút" options={minutes} selected={draft.minutes} onSelect={(m) => setDraft({ ...draft, minutes: m })} />
      </View>
      <Button fullWidth label="Áp dụng" onPress={() => onApply(draft)} />
    </View>
  );
}

/**
 * Ô chọn GIỜ (`HH:mm`, 24 giờ): bấm mở tấm trượt hai cột Giờ · Phút, chọn xong bấm "Áp dụng" (hai lựa chọn nên phải có bước
 * xác nhận — khác `DatePicker` một ngày). Dựng từ kit sẵn (`BottomSheet` + style ô của `DatePicker`), KHÔNG dùng picker native:
 * `@react-native-community/datetimepicker` là module native khác nhau hẳn giữa iOS/Android, không chạy trên Expo Go và phải rebuild
 * dev-client — không đáng cho một ô chọn giờ. ⚠️ Giá trị là CHUỖI, không phải `Date`: ghép với ngày (và múi giờ) là việc của form.
 */
export function TimePicker({
  className,
  disabled = false,
  error,
  label,
  minuteStep = 5,
  onChange,
  placeholder = 'Chọn giờ',
  title,
  value,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseTime(value);
  const minutes = minuteOptions(minuteStep);
  const display = parsed ? formatClockTime(parsed) : '';
  const shown = display === '' ? placeholder : display;

  let state: 'default' | 'disabled' | 'error' = 'default';
  if (disabled) state = 'disabled';
  else if (error !== undefined) state = 'error';
  const styles = datePickerStyles({ empty: display === '', state });

  const initial: ClockTime = parsed
    ? { hours: parsed.hours, minutes: snapMinutes(parsed.minutes, minutes) }
    : { hours: 9, minutes: 0 };

  return (
    <View className={styles.root({ className })}>
      {label === undefined ? null : (
        <Text className={styles.label()} numberOfLines={1}>
          {label}
        </Text>
      )}
      <Pressable
        accessibilityHint={error}
        accessibilityLabel={`${label ?? 'Giờ'}, ${shown}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={styles.field()}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text className={styles.value()} numberOfLines={1}>
          {shown}
        </Text>
        <Icon color={disabled ? 'fg-5' : 'fg-3'} name="clock" />
      </Pressable>
      {error === undefined ? null : (
        <View className={styles.messageRow()}>
          <Icon color="error" name="alert-warning" size="xs" />
          <Text className={styles.message()}>{error}</Text>
        </View>
      )}
      <BottomSheet title={title ?? label ?? placeholder} visible={open} onClose={() => setOpen(false)}>
        {!open ? null : (
          <TimeSheetBody
            initial={initial}
            minutes={minutes}
            onApply={(time) => {
              onChange(formatClockTime(time));
              setOpen(false);
            }}
          />
        )}
      </BottomSheet>
    </View>
  );
}
