import { View } from 'react-native';

import { openAppSettings } from '@/core/media/permissions';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';

import { PreJoinView } from '../components/prejoin/PreJoinView';
import { StatusPage } from '../components/waiting/StatusPage';
import type { BriefState, MeetingJoinFlow } from '../hooks/useMeetingJoinFlow';
import { usePreJoinDevices } from '../hooks/usePreJoinDevices';
import { useRenderVideo } from '../hooks/useRenderVideo';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { OFFLINE_MESSAGE } from '../utils/meeting-room-errors';

export interface PreJoinSectionProps {
  flow: MeetingJoinFlow;
  onExit: () => void;
}

/** Chi tiết cuộc họp chưa dùng được: đang tải (khung xương), mất mạng ("Kết nối để tham gia") hoặc lỗi khác — có "Thử lại"/"Đóng". */
function BriefUnavailable({ onExit, onRetry, state }: { onExit: () => void; onRetry: () => void; state: BriefState }) {
  if (state === 'loading') {
    return (
      <Screen header={<AppBar title="Tham gia cuộc họp" onBack={onExit} />}>
        <View className="py-md">
          <SkeletonParagraph />
        </View>
      </Screen>
    );
  }
  const offline = state === 'offline';
  return (
    <StatusPage
      actions={
        <>
          <Button fullWidth label="Thử lại" onPress={onRetry} />
          <Button fullWidth label="Đóng" variant="secondary" onPress={onExit} />
        </>
      }
      description={offline ? OFFLINE_MESSAGE : 'Đã có lỗi khi tải thông tin cuộc họp. Hãy thử lại.'}
      headerTitle="Tham gia cuộc họp"
      icon="alert-information"
      title={offline ? 'Kết nối để tham gia' : 'Chưa tải được cuộc họp'}
      onBack={onExit}
    />
  );
}

/**
 * Pre-join (app.md §3.2): chi tiết cuộc họp + thiết bị (mic/camera MẶC ĐỊNH TẮT, xem trước camera) + tên hiển thị; nút chính theo `myActions`.
 * Chỉ dựng `PreJoinView` khi ĐÃ có chi tiết: ô tên là uncontrolled (chỉ đọc `defaultValue` lúc dựng) nên phải có tên mặc định ngay từ đầu.
 */
export function PreJoinSection({ flow, onExit }: PreJoinSectionProps) {
  const devices = usePreJoinDevices(true);
  const renderVideo = useRenderVideo();
  const busy = useMeetingRoomStore((state) => state.busy);
  const error = useMeetingRoomStore((state) => state.error);
  const { brief } = flow;

  if (!brief) return <BriefUnavailable state={flow.briefState} onExit={onExit} onRetry={flow.retryBrief} />;

  return (
    <PreJoinView
      audioRouteLabel={devices.speakerOn ? 'Loa ngoài' : 'Loa trong'}
      camDenied={devices.camDenied}
      camOn={devices.prefs.cam}
      defaultDisplayName={devices.prefs.displayName}
      endAt={brief.endAt}
      error={error}
      facing={devices.prefs.facing}
      live={brief.status === 'LIVE'}
      micDenied={devices.micDenied}
      micLevel={devices.micLevel}
      micOn={devices.prefs.mic}
      previewRef={devices.previewRef}
      primaryLabel={flow.primaryLabel}
      primaryLoading={busy}
      renderVideo={renderVideo}
      startAt={brief.startAt}
      title={brief.title}
      onChangeName={devices.setDisplayName}
      onClose={onExit}
      onFlipCamera={devices.flipCamera}
      onListenOnly={() => void flow.submitListenOnly()}
      onOpenAudioRoute={devices.toggleSpeaker}
      onOpenSettings={openAppSettings}
      onPrimary={() => void flow.submit()}
      onRetry={error ? () => void flow.submit() : undefined}
      onToggleCam={() => void devices.toggleCam()}
      onToggleMic={() => void devices.toggleMic()}
    />
  );
}
