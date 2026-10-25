import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { formatDayLong, formatTimeRange, meetingZoneNote } from '../../utils/meeting-time.utils';
import { waitingStatus } from '../../utils/meeting-waiting.utils';
import { MeetingStatusBadge } from '../card/MeetingStatusBadge';
import { MeetingStatusTile } from '../card/MeetingStatusTile';
import { MeetingCalendarButton } from './MeetingCalendarButton';
import { MeetingInfoRow } from './MeetingInfoRow';

export interface MeetingTimeHeroProps {
  meeting: MeetingDetailDto;
  /** "Bây giờ" theo giờ SERVER (`useMeetingClock`). */
  nowMs: number;
}

/**
 * Đầu màn chi tiết (app.md p2-04 §3 `MeetingTimeHero`): trạng thái (chữ, không chỉ màu), tiêu đề, ngày + giờ theo THIẾT BỊ, dòng phụ
 * giờ theo múi giờ CỦA CUỘC HỌP khi khác ("09:00 giờ Hà Nội", MT-19), nút "Thêm vào lịch" (`.ics` → bảng chia sẻ hệ điều hành) và khối PHÒNG CHỜ — đếm ngược tới giờ họp, mốc phòng chờ mở,
 * "Đang diễn ra 00:14:22". Không tự vào phòng khi đếm về 0 (README §7: luật không tự bật mic/camera) — nút vào do `MeetingActionsBar`.
 */
export function MeetingTimeHero({ meeting, nowMs }: MeetingTimeHeroProps) {
  const zone = meetingZoneNote(meeting.startAt, meeting.timezone);
  const waiting = waitingStatus(meeting, nowMs);

  return (
    <View className="gap-sm">
      {/* Ô icon lớn theo trạng thái cạnh tiêu đề — cùng tông với badge (`MeetingStatusTile`), là điểm nhấn thị giác đầu màn. */}
      <View className="flex-row items-start gap-sm">
        <MeetingStatusTile size="lg" status={meeting.status} />
        <View className="flex-1 items-start gap-2xs">
          <MeetingStatusBadge status={meeting.status} />
          <Text
            accessibilityRole="header"
            className={cn(
              'text-header-md',
              meeting.status === 'CANCELLED' ? 'text-fg-2 line-through' : 'text-fg-1',
            )}
          >
            {meeting.title}
          </Text>
        </View>
      </View>
      <MeetingInfoRow icon="calendar" text={formatDayLong(meeting.startAt)} />
      <MeetingInfoRow icon="clock" text={formatTimeRange(meeting.startAt, meeting.endAt)} />
      {/* `pl-xl` (24) = icon 16 + khe `gap-xs` 8 của `MeetingInfoRow` ⇒ dòng múi giờ thẳng mép chữ giờ bên trên (`pl-lg` cũ lệch 4dp). */}
      {zone ? <Text className="pl-xl text-caption-lg text-fg-2">{zone}</Text> : null}
      <MeetingCalendarButton meeting={meeting} />
      {waiting ? (
        // Ô đồng hồ đếm ngược dẫn khối phòng chờ: khối này đổi theo từng giây nên cần một mốc nhìn cố định để mắt tìm lại nó.
        <View className="flex-row items-center gap-sm rounded-md bg-bg-2 p-sm">
          <IconTile
            name={meeting.status === 'LIVE' ? 'audio' : 'timer'}
            size="sm"
            tone={meeting.status === 'LIVE' ? 'success' : 'info'}
          />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-lg text-fg-1">{waiting.headline}</Text>
            {waiting.hint ? <Text className="text-body-md text-fg-2">{waiting.hint}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
