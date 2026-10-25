import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { PublishRecapDialog } from '../components/recap/PublishRecapDialog';
import { RecapContent } from '../components/recap/RecapContent';
import { useMeetingRecapSocket } from '../hooks/useMeetingRecapSocket';
import { usePublishRecap, useRecap } from '../queries/recap.queries';
import { isGoneError, recapErrorMessage } from '../utils/recap-errors';
import { backToMeeting, openRecapEditor } from '../utils/recap-navigation';

/**
 * Xem biên bản (app.md p2-06 §3 `RecapScreen`). Người sửa (chủ trì/đồng chủ trì/tác giả) thấy NHÁP + nút "Sửa"/"Công bố" theo `myActions`;
 * người xem chỉ thấy bản đã công bố — chưa công bố thì BE trả 404 (không lộ nháp), màn nói trung tính "Chủ trì chưa công bố biên bản".
 * Realtime: `meeting:recap-published` làm mới.
 */
export function RecapScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const recap = useRecap(meetingId);
  const publish = usePublishRecap(meetingId);
  const [confirming, setConfirming] = useState(false);
  useMeetingRecapSocket(meetingId);
  const header = <AppBar title="Biên bản cuộc họp" onBack={() => backToMeeting(meetingId)} />;
  const dto = recap.data;

  if (!dto) {
    return (
      <Screen header={header}>
        {recap.isError && isGoneError(recap.error) ? (
          <EmptyState
            actions={[{ label: 'Về chi tiết cuộc họp', onPress: () => backToMeeting(meetingId) }]}
            description="Chủ trì chưa công bố biên bản, hoặc bạn không còn quyền xem cuộc họp này."
            icon="document"
            title="Chưa có biên bản để xem"
            tone="neutral"
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

  const { canEdit, canPublish } = dto.myActions;
  if (dto.recapId === null) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={canEdit ? [{ label: 'Viết biên bản', onPress: () => openRecapEditor(meetingId, { replace: true }) }] : []}
          description={canEdit ? 'Ghi lại nội dung, quyết định và việc cần làm của cuộc họp.' : 'Chủ trì chưa công bố biên bản.'}
          icon="document"
          title="Chưa có biên bản"
          tone="info"
        />
      </Screen>
    );
  }

  const showPublish = canPublish && dto.hasUnpublishedChanges;
  const republish = Boolean(dto.publishedAt);
  const confirmPublish = async () => {
    try {
      await publish.mutateAsync(dto.version);
      setConfirming(false);
      hapticSuccess();
      showToast('success', republish ? 'Đã cập nhật biên bản đã công bố.' : 'Đã công bố biên bản.');
    } catch (error) {
      setConfirming(false);
      showToast('error', recapErrorMessage(error));
      void recap.refetch();
    }
  };

  const footer =
    canEdit || showPublish ? (
      <BottomActionBar>
        {showPublish ? (
          <Button fullWidth iconLeft="share-02" label={republish ? 'Cập nhật biên bản đã công bố' : 'Công bố'} onPress={() => setConfirming(true)} />
        ) : null}
        {canEdit ? (
          <Button fullWidth iconLeft="edit" label="Sửa biên bản" variant={showPublish ? 'secondary' : 'primary'} onPress={() => openRecapEditor(meetingId)} />
        ) : null}
      </BottomActionBar>
    ) : undefined;

  return (
    <Screen footer={footer} header={header} refreshing={recap.isRefetching} onRefresh={() => void recap.refetch()}>
      <RecapContent recap={dto} />
      <PublishRecapDialog
        loading={publish.isPending}
        republish={republish}
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmPublish()}
      />
    </Screen>
  );
}
