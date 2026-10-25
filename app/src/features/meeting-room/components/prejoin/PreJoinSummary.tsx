import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDate, formatTime } from '@/shared/utils/format/date.utils';

export interface PreJoinSummaryProps {
  /** Giờ kết thúc dự kiến (ISO). */
  endAt: string;
  /** Cuộc họp đang diễn ra (`status === 'LIVE'`) — hiện nhãn CHỮ "Đang diễn ra", không chỉ dựa vào màu. */
  live: boolean;
  /** Giờ bắt đầu theo lịch (ISO). */
  startAt: string;
  title: string;
}

/**
 * Tiêu đề + giờ họp ở đầu KHỐI THÔNG TIN của pre-join (app.md p2-05 §3.2) — ngay dưới khung xem trước (dọc) hoặc đầu cột phải (ngang),
 * như phòng chờ của Google Meet. Giờ theo THIẾT BỊ (`formatTime`, README p2-04 §7) — đồng hồ đếm theo giờ server nằm ở
 * `WaitingForHostView`, ở đây chỉ nhắc người dùng đang vào cuộc họp nào và khi nào.
 *
 * Ô máy quay tông `info` (tông của phân hệ Lịch họp ở Trang chủ) — cùng nhịp "ô icon + tiêu đề" với đầu màn chi tiết cuộc họp mà người dùng
 * vừa rời, nên chuyển màn không thấy lạc. Ô chuyển tông `success` khi cuộc họp đang diễn ra (khớp huy hiệu chữ bên cạnh).
 */
export function PreJoinSummary({ endAt, live, startAt, title }: PreJoinSummaryProps) {
  return (
    <View className="flex-row items-start gap-sm">
      <IconTile name="video-camera" size="lg" tone={live ? 'success' : 'info'} />
      <View className="flex-1 gap-2xs">
        {live ? (
          <View className="items-start">
            <Badge label="Đang diễn ra" variant="success" />
          </View>
        ) : null}
        <Text accessibilityRole="header" className="text-header-md text-fg-1">
          {title}
        </Text>
        <View className="flex-row items-center gap-2xs">
          <Icon color="fg-2" name="calendar" size={16} />
          <Text className="flex-1 text-body-md text-fg-2">
            {`${formatDate(startAt)} · ${formatTime(startAt)} – ${formatTime(endAt)}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
