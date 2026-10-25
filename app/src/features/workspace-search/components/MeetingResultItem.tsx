import { memo } from 'react';

import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { MeetingHit } from '../api';
import { formatMeetingRange, MEETING_STATUS_LABEL } from '../utils/result-format';

export interface MeetingResultItemProps {
  hit: MeetingHit;
  onPress: (hit: MeetingHit) => void;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  CANCELLED: 'error',
  ENDED: 'neutral',
  LIVE: 'success',
  SCHEDULED: 'info',
};

/**
 * Một kết quả CUỘC HỌP (app.md p5-04 §3): tiêu đề · thời gian theo GIỜ MÁY · trạng thái bằng CHỮ (không chỉ màu) · "Bạn
 * được mời". Chạm → chi tiết cuộc họp của p2-04 bằng route `/meetings/[meetingId]` (không import `features/meetings`).
 */
export const MeetingResultItem = memo(function MeetingResultItem({
  hit,
  onPress,
}: MeetingResultItemProps) {
  const range = formatMeetingRange(hit.startAt, hit.endAt);
  const status = MEETING_STATUS_LABEL[hit.status] ?? hit.status;

  return (
    <ListItem
      className="px-md"
      description={hit.isAttendee ? `${range} · Bạn được mời` : range}
      label={hit.title}
      // Ô icon tông `info` = nhận diện phân hệ Lịch họp (khớp Trang chủ); họp đã huỷ/kết thúc về `neutral`.
      leading={
        <IconTile
          name="calendar"
          size="sm"
          tone={hit.status === 'CANCELLED' || hit.status === 'ENDED' ? 'neutral' : 'info'}
        />
      }
      value={<Badge label={status} size="sm" variant={STATUS_VARIANT[hit.status] ?? 'neutral'} />}
      onPress={() => onPress(hit)}
    />
  );
});
