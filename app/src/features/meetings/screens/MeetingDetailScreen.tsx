import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton, SkeletonParagraph } from '@/shared/ui/skeleton';
import { PATHS } from '@/shell/config/constants';

import { MeetingDetailContent } from '../components/detail/MeetingDetailContent';
import { useMeetingDetailScope } from '../hooks/useMeetingDetailScope';
import { useMeetingDetail } from '../queries/meetings.queries';
import { classifyMeetingError } from '../utils/meeting-errors';

/**
 * Chi tiết cuộc họp (app.md p2-04 §3). Trạng thái tải/lỗi ở đây; khi đã có dữ liệu thì cả màn (khung, AppBar, thân, nút vào) ở `MeetingDetailContent`. 404 ⇒
 * "Cuộc họp không còn khả dụng" + về lịch (bị huỷ/xoá/không còn quyền — server không phân biệt để khỏi lộ tồn tại). Vào phòng họp là
 * p2-05 (`openMeetingRoom`). Realtime: `room:join meet:{id}` + bị xoá khỏi danh sách ⇒ quay lại (`useMeetingDetailScope`).
 */
export function MeetingDetailScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const detail = useMeetingDetail(meetingId);
  useMeetingDetailScope(meetingId);
  const meeting = detail.data;
  const header = <AppBar title="Chi tiết cuộc họp" onBack={router.back} />;

  if (!meeting) {
    const failure = detail.isError ? classifyMeetingError(detail.error) : null;
    return (
      <Screen header={header}>
        {failure?.kind === 'NOT_FOUND' ? (
          <EmptyState
            actions={[{ label: 'Về lịch họp', onPress: () => router.replace(PATHS.MEETINGS) }]}
            description="Cuộc họp đã bị huỷ, bị xoá hoặc bạn không còn quyền xem."
            icon="calendar"
            title="Cuộc họp không còn khả dụng"
            tone="neutral"
          />
        ) : failure ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void detail.refetch() }]}
            description={failure.message}
            icon="alert-warning"
            size="compact"
            title="Không mở được cuộc họp"
            tone="danger"
          />
        ) : (
          // Khung xương theo HÌNH khối đầu màn thật (ô trạng thái 48 + nhãn + tiêu đề), rồi đoạn thông tin — dữ liệu về không nhảy bố cục.
          <View className="gap-md py-xs">
            <View className="flex-row items-start gap-sm">
              <Skeleton className="size-5xl rounded-sm" />
              <View className="flex-1 gap-xs">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-8 rounded-xs" />
              </View>
            </View>
            <SkeletonParagraph />
          </View>
        )}
      </Screen>
    );
  }

  return <MeetingDetailContent meeting={meeting} refetch={detail.refetch} />;
}
