import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/shell/store/slices/auth';

import { ReactionsOverlay } from '../components/controls/ReactionsOverlay';
import { MeetingControlBar } from '../components/controls/MeetingControlBar';
import { RoomChromeSlot } from '../components/controls/RoomChromeSlot';
import { MeetingStage } from '../components/stage/MeetingStage';
import { ClosingSoonBanner } from '../components/status/ClosingSoonBanner';
import { MeetingHeader } from '../components/status/MeetingHeader';
import { RecordingIndicator } from '../components/recording/RecordingIndicator';
import { ReconnectBanner } from '../components/status/ReconnectBanner';
import { useHostMounted } from '../hooks/use-runtime-owner';
import { useAutoHideControls } from '../hooks/useAutoHideControls';
import { useGridPaging } from '../hooks/useGridPaging';
import { useMeetingControls } from '../hooks/useMeetingControls';
import { useMeetingHostControls } from '../hooks/useMeetingHostControls';
import { useMeetingPeople } from '../hooks/useMeetingPeople';
import { useMeetingReactions } from '../hooks/useMeetingReactions';
import { useRaiseHand } from '../hooks/useRaiseHand';
import { useRecordingControls } from '../hooks/useRecordingControls';
import { useRenderVideo } from '../hooks/useRenderVideo';
import { useRoomBackHandler } from '../hooks/useRoomBackHandler';
import { useRoomDialogs } from '../hooks/useRoomDialogs';
import { useServerNow } from '../hooks/useServerNow';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { elapsedSeconds, formatDuration } from '../utils/clock.utils';
import { raisedHandOrder } from '../utils/hand-queue.utils';
import { meetingInviteMessage } from '../utils/invite-message';
import { RecordingLayer } from './RecordingLayer';
import { RoomSheets } from './RoomSheets';

export interface InRoomViewProps {
  meetingId: string;
  /** Rời MÀN mà giữ phòng (thu nhỏ) — chỉ được nối vào nút "Thu nhỏ" khi có `MeetingRoomHost`. */
  onMinimize: () => void;
}

/**
 * Phòng họp đang diễn ra (`IN_ROOM`/`RECONNECTING`): tiêu đề (+ Chat, Mọi người, "✋ n"), sân khấu (lưới phân trang/diễn giả/chia sẻ),
 * thanh điều khiển MỘT hàng, cảm xúc, và các sheet. Nền tối cố định như sân khấu video. Nằm ngang: thanh điều khiển thành cột bên phải.
 *
 * Ẩn/hiện tiêu đề + thanh (`useAutoHideControls`): tự ẩn sau 5 giây không chạm khi xem chia sẻ, gõ lên sân khấu để ẩn/hiện (Meet) — không
 * ẩn khi có sheet/hộp thoại/trình đọc màn hình. ✅ Ẩn = MỜ DẦN tại chỗ (`RoomChromeSlot`), chỗ của thanh được GIỮ ⇒ sân khấu không bao
 * giờ đổi kích thước theo thanh (trước đây gỡ hẳn thanh ⇒ lưới dựng lại, video nhảy). Riêng "Toàn màn hình" của nội dung chia sẻ (người
 * dùng chủ động bấm) mới gỡ thanh khỏi bố cục để nhường chỗ.
 */
export function InRoomView({ meetingId, onMinimize }: InRoomViewProps) {
  const insets = useSafeAreaInsets();
  const meId = useAuthStore((state) => state.user?.id) ?? '';
  const brief = useMeetingRoomStore((state) => state.brief);
  const phase = useMeetingRoomStore((state) => state.phase);
  const role = useMeetingRoomStore((state) => state.role) ?? 'MEMBER';
  const sheet = useMeetingRoomStore((state) => state.sheet);
  const layout = useMeetingRoomStore((state) => state.layout);
  const pinnedUserId = useMeetingRoomStore((state) => state.pinnedUserId);
  const lockedAt = useMeetingRoomStore((state) => state.lockedAt);
  const closingAt = useMeetingRoomStore((state) => state.closingAt);
  const startedAt = useMeetingRoomStore((state) => state.startedAt);
  const chatUnread = useMeetingRoomStore((state) => state.chatUnread);
  const handRaised = useMeetingRoomStore((state) => state.handRaisedAt !== null);
  const lobbyCount = useMeetingRoomStore((state) => state.lobby.length);

  const { ordered } = useMeetingPeople(true);
  const paging = useGridPaging(ordered);
  const controls = useMeetingControls();
  const host = useMeetingHostControls();
  const raise = useRaiseHand();
  const reactions = useMeetingReactions();
  const dialogs = useRoomDialogs();
  const recording = useRecordingControls();
  const renderVideo = useRenderVideo();
  const nowMs = useServerNow(true);
  const hostMounted = useHostMounted();
  const [expanded, setExpanded] = useState(false);
  const sharing = ordered.some((person) => person.screenShareRef);
  // ⛔ Hết chia sẻ khi đang "Toàn màn hình": `ScreenShareSpotlight` bị gỡ mà không báo `false` ⇒ trước đây thanh điều khiển kẹt ẩn MÃI
  // (không còn nút Rời/Mic). Quên chế độ đó ngay lúc vẽ (mẫu "chỉnh state theo prop" của React).
  if (expanded && !sharing) setExpanded(false);
  const raisedHands = useMemo(() => raisedHandOrder(ordered).size, [ordered]);
  // Gõ-để-ẩn chỉ khi KHÔNG có chia sẻ (chạm nội dung chia sẻ = "Toàn màn hình") và có người khác để xem (chỉ có mình: sân khấu là thẻ mời).
  const chrome = useAutoHideControls(sharing, sheet !== 'NONE' || dialogs.leaveOpen || dialogs.confirm !== null, !sharing && ordered.length > 1);
  const chromeHidden = expanded || chrome.hidden;
  const { openLeave } = dialogs;
  // Phím Back trong phòng: có nơi giữ phòng (Host) thì thu nhỏ; chưa có thì hỏi Rời — không bao giờ bỏ họp lặng lẽ.
  const onBack = useCallback((): boolean => {
    if (hostMounted) onMinimize();
    else openLeave();
    return true;
  }, [hostMounted, onMinimize, openLeave]);
  useRoomBackHandler(onBack);
  const title = brief?.title ?? 'Cuộc họp';
  const openParticipants = () => controls.openSheet('PARTICIPANTS');

  return (
    <View className="flex-1 bg-ink-10" style={{ paddingBottom: insets.bottom, paddingTop: insets.top }}>
      {/* Nền `ink-10` cố định ở cả hai theme: chữ thanh trạng thái luôn `light` (gốc `auto` ở chế độ sáng cho chữ ĐEN trên nền đen). */}
      <StatusBar style="light" />
      <View className="flex-1 landscape:flex-row" testID="room-content" onTouchStart={chrome.reveal}>
        <View className="flex-1">
          <RoomChromeSlot collapsed={expanded} edge="top" visible={!chromeHidden}>
            <MeetingHeader
              chatBadge={chatUnread}
              clock={formatDuration(elapsedSeconds(startedAt, nowMs))}
              lobbyCount={lobbyCount}
              locked={lockedAt !== null}
              participantCount={ordered.length}
              quality={ordered.find((person) => person.isLocal)?.connectionQuality ?? 'unknown'}
              raisedHands={raisedHands}
              recordingStatus={recording.recording?.status}
              role={role}
              title={title}
              onMinimize={hostMounted ? onMinimize : undefined}
              onOpenChat={() => controls.openSheet('CHAT')}
              onOpenParticipants={openParticipants}
            />
          </RoomChromeSlot>
          {phase === 'RECONNECTING' ? <ReconnectBanner /> : null}
          <ClosingSoonBanner closingAt={closingAt} nowMs={nowMs} />
          <View className="flex-1" testID="room-stage" {...chrome.stageTouch}>
            <MeetingStage
              landscape={paging.landscape}
              layout={layout}
              page={paging.page}
              pageSize={paging.pageSize}
              people={ordered}
              pinnedUserId={pinnedUserId}
              renderVideo={renderVideo}
              onChangePage={paging.setPage}
              onExpandedChange={setExpanded}
              onInvite={() => void Share.share({ message: meetingInviteMessage(title, brief?.code) })}
              onPin={controls.togglePin}
              onStopShare={() => void controls.toggleScreenShare()}
            />
            <ReactionsOverlay nameOf={reactions.nameOf} reactions={reactions.reactions} onDone={reactions.drop} />
          </View>
          {/* RR-19: tiêu đề ẩn (xem chia sẻ/không chạm/toàn màn hình) thì chỉ báo ghi hình vẫn nổi ở mép trên, giữa — không bao giờ ghi mà
              không ai thấy. Giữa chứ không trái: góc trái-trên của nội dung chia sẻ đã có nhãn "… đang chia sẻ màn hình". */}
          {chromeHidden ? (
            <View className="absolute inset-x-0 top-xs items-center" pointerEvents="none">
              <RecordingIndicator status={recording.recording?.status} />
            </View>
          ) : null}
        </View>
        <RoomChromeSlot collapsed={expanded} edge="bottom" visible={!chromeHidden}>
          <MeetingControlBar
            camBusy={controls.camBusy}
            camOn={controls.camOn}
            consentLocked={recording.consentLocked}
            handRaised={handRaised}
            micBusy={controls.micBusy}
            micOn={controls.micOn}
            stopRecordingBusy={recording.busy === 'STOP'}
            onConsentLocked={recording.reopenConsent}
            onLeave={dialogs.openLeave}
            onOpenMore={() => controls.openSheet('MORE')}
            onOpenReactions={() => controls.openSheet('REACTIONS')}
            onStopRecording={recording.active && recording.canControl ? () => void recording.stop() : undefined}
            onToggleCamera={() => void controls.toggleCamera()}
            onToggleHand={() => void raise.toggle()}
            onToggleMic={() => void controls.toggleMic()}
          />
        </RoomChromeSlot>
      </View>
      <RoomSheets controls={controls} dialogs={dialogs} host={host} meetingId={meetingId} meId={meId} people={ordered} reactions={reactions} recording={recording} role={role} />
      <RecordingLayer controls={recording} />
    </View>
  );
}
