import { View } from 'react-native';

import { TimePicker } from '@/shared/ui/time-picker';

import { formatClock, withClock } from '../../utils/recap-time.utils';

export interface RecapTimeFieldsProps {
  disabled?: boolean;
  endedAt?: string;
  startedAt?: string;
  onChange: (patch: { endedAt?: string; startedAt?: string }) => void;
}

/**
 * Giờ họp THỰC TẾ ghi vào biên bản (app.md §3 `RecapEditorScreen`) — mặc định từ phiên họp (BE điền `Meeting.startedAt/endedAt`); chỉ
 * đổi GIỜ:PHÚT, giữ nguyên ngày của cuộc họp. Giờ kết thúc trước giờ bắt đầu thì BE trả 400 (không kiểm trùng ở đây).
 */
export function RecapTimeFields({ disabled, endedAt, startedAt, onChange }: RecapTimeFieldsProps) {
  const base = startedAt ?? endedAt;
  return (
    <View className="flex-row gap-sm">
      <View className="flex-1">
        <TimePicker
          disabled={disabled || !base}
          label="Bắt đầu thực tế"
          title="Giờ bắt đầu thực tế"
          value={formatClock(startedAt)}
          onChange={(clock) => base && onChange({ startedAt: withClock(startedAt ?? base, clock) })}
        />
      </View>
      <View className="flex-1">
        <TimePicker
          disabled={disabled || !base}
          label="Kết thúc thực tế"
          title="Giờ kết thúc thực tế"
          value={formatClock(endedAt)}
          onChange={(clock) => base && onChange({ endedAt: withClock(endedAt ?? base, clock) })}
        />
      </View>
    </View>
  );
}
