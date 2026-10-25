import { View } from 'react-native';

import { DatePicker } from '@/shared/ui/date-picker';
import { TimePicker } from '@/shared/ui/time-picker';

export interface DateTimeFieldsProps {
  date: Date | null;
  /** `HH:mm`; rỗng = chưa chọn. */
  time: string;
  onChangeDate: (date: Date) => void;
  onChangeTime: (time: string) => void;
  dateError?: string;
  timeError?: string;
  minDate: Date;
  maxDate: Date;
  dateLabel?: string;
  timeLabel?: string;
}

/**
 * Cặp ô "Ngày" + "Giờ" theo giờ MÁY (dùng chung cho chọn giờ gửi/nhắc và hạn khảo sát). Giờ bước 5 phút (mặc định của `TimePicker`), hiển thị 24 giờ. Ghép ngày + giờ → mốc
 * tuyệt đối là việc của nơi gọi (`combineDateAndTime`) — hai ô này chỉ giữ phần "đồng hồ treo tường". `minDate`/`maxDate` chỉ để LỊCH mờ ngày ngoài cửa sổ; luật thật (cách ≥ 1 phút,
 * ≤ N ngày) vẫn kiểm ở `checkWhen` và BE.
 *
 * ⚠️ Cả hai ô mở tấm trượt riêng. Đặt bên trong một `BottomSheet` khác nghĩa là hai `<Modal>` lồng nhau — chạy được trên Android (mỗi `Modal` một cửa sổ), CHƯA thử trên máy thật.
 */
export function DateTimeFields({
  date,
  time,
  onChangeDate,
  onChangeTime,
  dateError,
  timeError,
  minDate,
  maxDate,
  dateLabel = 'Ngày',
  timeLabel = 'Giờ',
}: DateTimeFieldsProps) {
  return (
    <View className="flex-row gap-sm">
      <DatePicker
        className="flex-1"
        error={dateError}
        label={dateLabel}
        maxDate={maxDate}
        minDate={minDate}
        placeholder="Chọn ngày"
        value={date}
        onChange={onChangeDate}
      />
      <TimePicker
        className="flex-1"
        error={timeError}
        label={timeLabel}
        placeholder="Chọn giờ"
        value={time === '' ? null : time}
        onChange={onChangeTime}
      />
    </View>
  );
}
