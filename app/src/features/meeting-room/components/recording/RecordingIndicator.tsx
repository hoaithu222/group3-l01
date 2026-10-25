import { View } from 'react-native';

import { Badge } from '@/shared/ui/badge';

import type { RoomRecordingStatus } from '../../api/meeting-room.types';

export interface RecordingIndicatorProps {
  className?: string;
  /** `null`/không đang ghi → không vẽ gì. */
  status: RoomRecordingStatus | null | undefined;
}

const LABEL: Partial<Record<RoomRecordingStatus, string>> = {
  RECORDING: '● Đang ghi hình',
  STARTING: '● Đang ghi hình',
  STOPPING: '● Đang dừng ghi',
};

/**
 * Chỉ báo "Đang ghi hình" (app.md p2-06 §3, RR-19): nhãn ĐỎ có CHỮ, hiện với MỌI người suốt lúc bản ghi chiếm phòng (`STARTING` — ngay khi
 * bấm bắt đầu, trước webhook — `RECORDING`, `STOPPING`), kể cả người vào sau và sau khi nối lại (trạng thái lấy từ kết quả vào/ảnh chụp phòng,
 * không chỉ từ sự kiện). Không bao giờ ghi ngầm: không có cách nào ẩn nhãn khi đang ghi. Vùng thông báo `polite` để trình đọc màn hình đọc lên
 * khi nhãn xuất hiện.
 */
export function RecordingIndicator({ className, status }: RecordingIndicatorProps) {
  const label = status ? LABEL[status] : undefined;
  if (!label) return null;
  return (
    <View accessibilityLiveRegion="polite" className={className}>
      <Badge
        accessibilityLabel={status === 'STOPPING' ? 'Đang dừng ghi hình cuộc họp' : 'Cuộc họp đang được ghi hình'}
        appearance="solid"
        label={label}
        variant="error"
      />
    </View>
  );
}
