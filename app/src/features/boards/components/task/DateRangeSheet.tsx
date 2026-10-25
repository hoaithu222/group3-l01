import dayjs from 'dayjs';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button, LinkButton } from '@/shared/ui/button';
import { DatePicker } from '@/shared/ui/date-picker';

import { endOfDayIso, isStartAfterDue, startOfDayIso } from '../../utils/task-dates';

export interface DateChange {
  dueDate?: string | null;
  startDate?: string | null;
}

export interface DateRangeSheetProps {
  /** Hạn chót hiện có (ISO) hoặc `null`. */
  due: string | null;
  error: string | null;
  saving: boolean;
  start: string | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (change: DateChange) => void;
}

const toDate = (iso: string | null): Date | null => (iso ? dayjs(iso).toDate() : null);
const sameDay = (a: Date | null, b: Date | null): boolean =>
  a === null || b === null ? a === b : dayjs(a).isSame(b, 'day');

/**
 * Đặt ngày bắt đầu / hạn chót (app.md §2 `DateRangeSheet`): hai `DatePicker` của bộ chung, mỗi ô có nút
 * "Xoá". Kiểm "bắt đầu ≤ hạn" NGAY tại tấm (BE cũng chặn bằng `TASK_013`) và chỉ gửi trường THẬT SỰ
 * đổi — không gửi lại hạn cũ làm sinh activity `DUE_CHANGED` và dời lịch nhắc hạn oan.
 * Hạn = CUỐI ngày, bắt đầu = ĐẦU ngày giờ máy (`task-dates.ts`).
 */
export function DateRangeSheet({
  due,
  error,
  saving,
  start,
  visible,
  onClose,
  onConfirm,
}: DateRangeSheetProps) {
  const [startValue, setStartValue] = useState<Date | null>(toDate(start));
  const [dueValue, setDueValue] = useState<Date | null>(toDate(due));
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStartValue(toDate(start));
      setDueValue(toDate(due));
    }
  }

  const invalid = isStartAfterDue(startValue, dueValue);
  const startChanged = !sameDay(startValue, toDate(start));
  const dueChanged = !sameDay(dueValue, toDate(due));

  const confirm = () => {
    if (!startChanged && !dueChanged) return onClose();
    onConfirm({
      ...(startChanged ? { startDate: startValue ? startOfDayIso(startValue) : null } : {}),
      ...(dueChanged ? { dueDate: dueValue ? endOfDayIso(dueValue) : null } : {}),
    });
  };

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      footer={
        // ⛔ `fullWidth`: thiếu nó nút "Lưu" ôm chữ thành viên thuốc nhỏ dạt trái — nút CHÍNH trông như nút phụ.
        <Button disabled={invalid} fullWidth label="Lưu" loading={saving} onPress={confirm} />
      }
      scrollable
      title="Ngày bắt đầu và hạn chót"
      visible={visible}
      onClose={onClose}
    >
      {/* Không `pb-md`: tấm có `footer`, khe dưới khối cuối do vùng đáy lo. */}
      <View className="gap-md">
        <View className="gap-2xs">
          <DatePicker
            error={invalid ? 'Ngày bắt đầu phải trước hạn chót' : undefined}
            label="Ngày bắt đầu"
            placeholder="Chưa đặt"
            title="Ngày bắt đầu"
            value={startValue}
            onChange={setStartValue}
          />
          {startValue ? (
            <LinkButton label="Xoá ngày bắt đầu" onPress={() => setStartValue(null)} />
          ) : null}
        </View>
        <View className="gap-2xs">
          <DatePicker
            label="Hạn chót"
            placeholder="Chưa đặt"
            title="Hạn chót"
            value={dueValue}
            onChange={setDueValue}
          />
          {dueValue ? <LinkButton label="Xoá hạn chót" onPress={() => setDueValue(null)} /> : null}
        </View>
      </View>
    </BottomSheet>
  );
}
