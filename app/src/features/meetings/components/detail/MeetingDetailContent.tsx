import { router } from 'expo-router';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { useJoinWindowRefetch } from '../../hooks/useJoinWindowRefetch';
import { useMeetingClock } from '../../hooks/useMeetingClock';
import { MeetingActionsBar } from './MeetingActionsBar';
import { MeetingAttendeesSection } from './MeetingAttendeesSection';
import { MeetingDetailMenu } from './MeetingDetailMenu';
import { MeetingInfoSection } from './MeetingInfoSection';
import { MeetingLinksSection } from './MeetingLinksSection';
import { MeetingRsvpBar } from './MeetingRsvpBar';
import { MeetingTimeHero } from './MeetingTimeHero';

export interface MeetingDetailContentProps {
  meeting: MeetingDetailDto;
  refetch: () => unknown;
}

/**
 * Cả màn chi tiết khi ĐÃ có dữ liệu (khung `Screen` + AppBar + thân + nút vào họp ở đáy). Tách khỏi `MeetingDetailScreen` vì đồng hồ theo giờ
 * server (`useMeetingClock`) phải dựng SAU khi có `serverNow` (offset lệch đồng hồ chốt ở lần render đầu), và thanh đáy cần đúng đồng hồ đó.
 * Tới mốc phòng chờ mở, `useJoinWindowRefetch` hỏi lại server để bật nút vào — client không tự suy quyền.
 *
 * Bố cục: khối đầu (huỷ? · trạng thái/tiêu đề/giờ) → thông tin → trao đổi & tài liệu (mỗi lối vào một dòng có mũi tên) → phản hồi tham dự →
 * người tham dự; khe 24 giữa các khối. Nút VÀO họp cố định ở đáy (đúng MỘT nút chính); Chia sẻ + Sửa/Huỷ/Rời/Xoá ở AppBar (`MeetingDetailMenu`).
 */
export function MeetingDetailContent({ meeting, refetch }: MeetingDetailContentProps) {
  const clock = useMeetingClock(meeting);
  useJoinWindowRefetch(clock.joinRemainingMs, refetch);

  return (
    <Screen
      footer={<MeetingActionsBar joinRemainingMs={clock.joinRemainingMs} meeting={meeting} />}
      header={
        <AppBar
          actions={<MeetingDetailMenu meeting={meeting} />}
          title="Chi tiết cuộc họp"
          onBack={router.back}
        />
      }
    >
      <View className="gap-xl py-xs">
        <View className="gap-md">
          {meeting.status === 'CANCELLED' ? (
            <Alert
              description={
                meeting.cancelReason ? `Lý do: ${meeting.cancelReason}` : 'Cuộc họp này đã bị huỷ.'
              }
              title="Cuộc họp đã huỷ"
              tone="warning"
            />
          ) : null}
          <MeetingTimeHero meeting={meeting} nowMs={clock.nowMs} />
        </View>
        <MeetingInfoSection meeting={meeting} />
        <MeetingLinksSection meeting={meeting} />
        <MeetingRsvpBar meeting={meeting} />
        <MeetingAttendeesSection meeting={meeting} />
      </View>
    </Screen>
  );
}
