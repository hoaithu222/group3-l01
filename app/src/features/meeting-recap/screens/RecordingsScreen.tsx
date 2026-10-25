import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { RecordingDto } from '../api/meeting-recap.types';
import { DeleteRecordingDialog } from '../components/recording/DeleteRecordingDialog';
import { RecordingActionsSheet } from '../components/recording/RecordingActionsSheet';
import { RecordingListItem } from '../components/recording/RecordingListItem';
import { useMeetingRecapSocket } from '../hooks/useMeetingRecapSocket';
import { useRecordingDeletion } from '../hooks/useRecordingDeletion';
import { useRecordingDownload } from '../hooks/useRecordingDownload';
import { useServerClock } from '../hooks/useServerClock';
import { useMeetingTitle } from '../queries/meeting-title.queries';
import { useMeetingRecordings, useRetryImport } from '../queries/recording.queries';
import { isGoneError, recapErrorMessage } from '../utils/recap-errors';
import { backToMeeting, openRecordingPlayer } from '../utils/recap-navigation';

/**
 * Danh sách bản ghi của cuộc họp (app.md p2-06 §3 `RecordingsScreen`): mỗi bản một thẻ — Xem (READY), Thử lại (FAILED + `canRetry`), menu
 * Tải về/Xoá theo `myActions`. Realtime `meeting:recording-updated` làm mới (bản đang xử lý thành "Sẵn sàng" không cần kéo). Mất mạng: vẫn
 * hiện bản cache, ẩn hành động. 404 → "không còn khả dụng" + về chi tiết.
 */
export function RecordingsScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const list = useMeetingRecordings(meetingId);
  const title = useMeetingTitle(meetingId);
  const retry = useRetryImport(meetingId);
  const download = useRecordingDownload();
  const deletion = useRecordingDeletion(meetingId);
  const offline = useConnectionState() === 'offline';
  const nowMs = useServerClock();
  const [menuFor, setMenuFor] = useState<RecordingDto | null>(null);
  useMeetingRecapSocket(meetingId);
  const header = <AppBar subtitle={title} title="Bản ghi cuộc họp" onBack={() => backToMeeting(meetingId)} />;

  if (!list.data) {
    return (
      <Screen header={header}>
        {list.isError ? (
          <EmptyState
            actions={[
              isGoneError(list.error)
                ? { label: 'Về chi tiết cuộc họp', onPress: () => backToMeeting(meetingId) }
                : { label: 'Thử lại', onPress: () => void list.refetch() },
            ]}
            description={isGoneError(list.error) ? 'Cuộc họp đã bị xoá hoặc bạn không còn quyền xem.' : recapErrorMessage(list.error)}
            icon={isGoneError(list.error) ? 'play' : 'alert-warning'}
            size="compact"
            title={isGoneError(list.error) ? 'Bản ghi không còn khả dụng' : 'Không tải được bản ghi'}
            tone={isGoneError(list.error) ? 'neutral' : 'danger'}
          />
        ) : (
          // Khung xương cao bằng thẻ bản ghi thật (ô icon + 3 dòng + hàng nút) — danh sách không nhảy lúc dữ liệu về.
          <View className="gap-sm py-xs">
            <Skeleton className="h-36 rounded-md" />
            <Skeleton className="h-36 rounded-md" />
          </View>
        )}
      </Screen>
    );
  }

  const retryImport = (recordingId: string) =>
    retry.mutate(recordingId, {
      onError: (error) => showToast('error', recapErrorMessage(error)),
      onSuccess: () => showToast('info', 'Đang xử lý lại bản ghi.'),
    });

  return (
    <Screen header={header} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      {list.data.length === 0 ? (
        <EmptyState
          description="Bản ghi sẽ hiện ở đây sau khi chủ trì ghi hình và xử lý xong."
          icon="play"
          title="Cuộc họp chưa có bản ghi nào"
          tone="info"
        />
      ) : (
        <View className="gap-sm py-xs">
          {/* Mất mạng là lỗi KẾT NỐI, không phải bản ghi hỏng — nói bằng khối thông báo có icon (chữ trơn dễ bị lướt qua). */}
          {offline ? <Alert description="Kết nối mạng để xem hoặc tải bản ghi." tone="warning" /> : null}
          {/* Danh sách ngắn tự `.map()` (vài bản ghi mỗi cuộc họp) nên được hiện dần; nhịp trễ dừng ở thẻ thứ 6. */}
          {list.data.map((rec, index) => (
            <Reveal key={rec.id} index={Math.min(index, 6)}>
              <RecordingListItem
                downloadProgress={download.state.recordingId === rec.id ? download.state.progress : null}
                nowMs={nowMs}
                offline={offline}
                recording={rec}
                retrying={retry.isPending && retry.variables === rec.id}
                onCancelDownload={() => void download.cancel()}
                onMore={() => setMenuFor(rec)}
                onPlay={() => openRecordingPlayer(meetingId, rec.id)}
                onRetry={() => retryImport(rec.id)}
              />
            </Reveal>
          ))}
        </View>
      )}
      <RecordingActionsSheet
        recording={menuFor}
        onClose={() => setMenuFor(null)}
        onDelete={deletion.ask}
        onDownload={(rec) => void download.download(rec.id)}
      />
      <DeleteRecordingDialog
        loading={deletion.deleting}
        needReason={deletion.needReason}
        reason={deletion.reason}
        visible={deletion.target !== null}
        onCancel={deletion.close}
        onChangeReason={deletion.setReason}
        onConfirm={() => void deletion.confirm()}
      />
    </Screen>
  );
}
