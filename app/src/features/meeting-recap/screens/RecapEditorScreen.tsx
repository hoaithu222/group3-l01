import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';

import { RecapEditorForm } from '../components/recap/RecapEditorForm';
import { useMeetingRecapSocket } from '../hooks/useMeetingRecapSocket';
import { useMeetingTitle } from '../queries/meeting-title.queries';
import { useRecap } from '../queries/recap.queries';
import { isGoneError, recapErrorMessage } from '../utils/recap-errors';
import { backToMeeting } from '../utils/recap-navigation';

/**
 * Route `meetings/[meetingId]/recap-edit` (app.md §1): tải biên bản (nháp của người sửa) rồi mới dựng trình soạn — trình soạn khởi tạo state
 * MỘT lần từ bản server (không bị làm mới đè giữa lúc gõ). 404 / không được sửa → "không còn khả dụng" + về chi tiết (app.md §3 "404 khi lưu").
 */
export function RecapEditorScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const recap = useRecap(meetingId);
  const title = useMeetingTitle(meetingId);
  useMeetingRecapSocket(meetingId);
  const dto = recap.data;

  if (dto?.myActions.canEdit) return <RecapEditorForm initial={dto} meetingId={meetingId} title={title} />;

  const header = <AppBar title="Viết biên bản" onBack={() => backToMeeting(meetingId)} />;
  const gone = dto !== undefined || (recap.isError && isGoneError(recap.error));
  return (
    <Screen header={header}>
      {gone ? (
        <EmptyState
          actions={[{ label: 'Về chi tiết cuộc họp', onPress: () => backToMeeting(meetingId) }]}
          description="Chỉ chủ trì, đồng chủ trì hoặc người viết biên bản sửa được — khi cuộc họp đang diễn ra hoặc đã kết thúc."
          icon="lock"
          title="Không sửa được biên bản"
          tone="warning"
        />
      ) : recap.isError ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void recap.refetch() }]}
          description={recapErrorMessage(recap.error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được biên bản"
          tone="danger"
        />
      ) : (
        <View className="py-xs">
          <SkeletonParagraph />
        </View>
      )}
    </Screen>
  );
}
