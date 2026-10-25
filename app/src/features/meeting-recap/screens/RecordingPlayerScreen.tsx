import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectionState } from '@/core/socket';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import { RecordingVideo } from '../components/recording/RecordingVideo';
import { useRecordingDownload } from '../hooks/useRecordingDownload';
import { useRefreshingVideoSource } from '../hooks/useRefreshingVideoSource';
import { useMeetingTitle } from '../queries/meeting-title.queries';
import { useRecording } from '../queries/recording.queries';
import { spokenDuration } from '../utils/recording-format.utils';
import { backToMeeting } from '../utils/recap-navigation';

/**
 * Phát MỘT bản ghi (app.md p2-06 §3 `RecordingPlayerScreen`): nền đen, tiêu đề + ngày giờ, trình phát `expo-video`, nút "Tải về" cho người
 * có quyền. Lỗi: `REC_005`/404 → "Bản ghi đã bị xoá hoặc hết hạn"; mất mạng → "Kết nối để xem bản ghi"; khác → "Không phát được" + Thử lại.
 */
export function RecordingPlayerScreen() {
  const { meetingId, recordingId } = useLocalSearchParams<{ meetingId: string; recordingId: string }>();
  const insets = useSafeAreaInsets();
  const recording = useRecording(recordingId);
  const title = useMeetingTitle(meetingId);
  const source = useRefreshingVideoSource(recordingId);
  const download = useRecordingDownload();
  const offline = useConnectionState() === 'offline';
  const rec = recording.data;
  const state = source.state;
  const subtitle = rec ? [formatDateTime(rec.startedAt), spokenDuration(rec.durationSec)].filter(Boolean).join(' · ') : undefined;
  const downloading = download.state.recordingId === recordingId;

  return (
    <View className="flex-1 bg-ink-10" style={{ paddingBottom: insets.bottom }}>
      <AppBar
        actions={
          rec?.myActions.canDownload && !offline ? (
            <Button
              label={downloading ? `Đang tải ${String(Math.round((download.state.progress ?? 0) * 100))}%` : 'Tải về'}
              loading={downloading && download.state.progress === 0}
              size="sm"
              variant="secondary"
              onPress={() => (downloading ? void download.cancel() : void download.download(recordingId))}
            />
          ) : undefined
        }
        opaque
        subtitle={subtitle}
        title={title ?? 'Bản ghi cuộc họp'}
        onBack={() => backToMeeting(meetingId)}
      />
      {state.kind === 'ready' ? (
        <RecordingVideo initialUrl={state.url} renew={source.renew} />
      ) : state.kind === 'loading' ? (
        <View className="flex-1 justify-center px-md">
          <Skeleton className="aspect-video w-full" />
          <Text className="pt-sm text-center text-body-md text-fg-on-nav-muted">Đang chuẩn bị bản ghi…</Text>
        </View>
      ) : (
        <View className="flex-1 justify-center bg-bg-base">
          <EmptyState
            actions={
              state.gone
                ? [{ label: 'Về chi tiết cuộc họp', onPress: () => backToMeeting(meetingId) }]
                : [{ label: 'Thử lại', onPress: source.reload }]
            }
            description={state.gone ? 'Bản ghi đã bị xoá hoặc hết hạn lưu trữ.' : state.offline ? 'Kết nối mạng để xem bản ghi.' : state.message}
            icon={state.gone ? 'play' : state.offline ? 'unlink' : 'alert-warning'}
            title={state.gone ? 'Bản ghi không còn khả dụng' : 'Không phát được bản ghi'}
            tone={state.gone || state.offline ? 'neutral' : 'danger'}
          />
        </View>
      )}
    </View>
  );
}
