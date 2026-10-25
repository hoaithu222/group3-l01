import { Redirect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { PATHS } from '@/shell/config';
import { useAuthStore } from '@/shell/store/slices/auth';

import { BusyConflictDialog } from '../components/dialogs/BusyConflictDialog';
import { ConnectingRoomView } from '../components/waiting/ConnectingRoomView';
import { beginMeeting } from '../hooks/meeting-room.join';
import { leaveMeeting } from '../hooks/meeting-room.leave';
import { isInRoomPhase } from '../hooks/meeting-room.teardown';
import { resetMeetingRoomStores } from '../hooks/reset-meeting-room-stores';
import { useHostMounted } from '../hooks/use-runtime-owner';
import { navigateOutOfRoom, useExitMeetingRoom, useWriteRecapFromRoom } from '../hooks/useExitMeetingRoom';
import { useMeetingJoinFlow, type MeetingJoinFlow } from '../hooks/useMeetingJoinFlow';
import { useMeetingRoomRuntime } from '../hooks/useMeetingRoomRuntime';
import { useRoomBackHandler } from '../hooks/useRoomBackHandler';
import { meetingRoomApi, useMeetingRoomStore, type RoomPhase } from '../store/meeting-room.store';
import { InRoomView } from './InRoomView';
import { PreJoinSection } from './PreJoinSection';
import { BlockedSection, EndedSection, LobbySection, WaitingSection } from './StatusSections';

export interface MeetingRoomScreenProps {
  meetingId: string;
}

/**
 * Khung chờ trước khi phiên của cuộc họp này sẵn sàng trong store (một nhịp render — `beginMeeting` chạy trong effect). ⚠️ Cùng tiêu đề
 * "Tham gia cuộc họp" với khung tải chi tiết của pre-join ngay sau nó — khác chữ là tiêu đề nháy đổi trong lúc mở màn.
 */
function RoomLoading({ onExit }: { onExit: () => void }) {
  return (
    <Screen header={<AppBar title="Tham gia cuộc họp" onBack={onExit} />}>
      <View className="py-md">
        <SkeletonParagraph />
      </View>
    </Screen>
  );
}

/** Rời phiên đang nối rồi rời màn — "Huỷ" ở bước nối, và phím Back ở bước đó khi KHÔNG có nơi giữ phòng (không có MiniBar để quay lại). */
async function cancelConnecting(meetingId: string): Promise<void> {
  await leaveMeeting();
  navigateOutOfRoom(meetingId);
}

/** Đang nối media: nền tối như phòng (không nháy sáng→tối), cho người dùng HUỶ (một lần nối kẹt không được giữ họ lại trên màn này). */
function ConnectingView({ meetingId }: { meetingId: string }) {
  const busy = useMeetingRoomStore((state) => state.busy);
  const title = useMeetingRoomStore((state) => state.brief?.title);
  const prefs = useMeetingRoomStore((state) => state.preJoin);
  return (
    <ConnectingRoomView
      camOn={prefs.cam && !prefs.listenOnly}
      cancelling={busy}
      micOn={prefs.mic && !prefs.listenOnly}
      title={title}
      onCancel={() => void cancelConnecting(meetingId)}
    />
  );
}

/** Nội dung theo pha của máy trạng thái (app.md §3.1) — mỗi pha một component thuần đã được nối ở file riêng. */
function PhaseView({ flow, meetingId, onExit, onWriteRecap, phase }: { flow: MeetingJoinFlow; meetingId: string; onExit: () => void; onWriteRecap: () => void; phase: RoomPhase }) {
  // "Vào lại trên máy này" (màn kết thúc, chỉ khi phiên dừng vì vào bằng máy khác): dọn phiên cũ, mở lại pre-join của CHÍNH cuộc họp này và
  // tải lại chi tiết (store vừa reset mất `brief`). Vào tiếp sẽ hỏi chuyển thiết bị (`CALL_004`) — không tự `force`.
  const rejoin = async (): Promise<void> => {
    await resetMeetingRoomStores();
    beginMeeting(meetingId);
    flow.retryBrief();
  };
  switch (phase) {
    case 'PREJOIN':
      return <PreJoinSection flow={flow} onExit={onExit} />;
    case 'WAITING_FOR_HOST':
      return <WaitingSection onExit={onExit} />;
    case 'IN_LOBBY':
      return <LobbySection onCancel={() => void flow.cancelLobby()} />;
    case 'CONNECTING':
      return <ConnectingView meetingId={meetingId} />;
    case 'IN_ROOM':
    case 'RECONNECTING':
      return <InRoomView meetingId={meetingId} onMinimize={onExit} />;
    case 'ENDED':
      return <EndedSection onExit={onExit} onRejoin={() => void rejoin()} onWriteRecap={onWriteRecap} />;
    case 'REMOVED':
      return <BlockedSection removed onExit={onExit} />;
    case 'BLOCKED':
      return <BlockedSection onExit={onExit} />;
  }
}

/**
 * MÀN PHÒNG HỌP toàn màn (`meeting-room/[meetingId]`, app.md p2-05 §1, §3.1): điều phối theo `phase` của máy trạng thái —
 * PREJOIN → (WAITING_FOR_HOST | IN_LOBBY | CONNECTING → IN_ROOM ↔ RECONNECTING) → ENDED | REMOVED | BLOCKED. Không chứa UI lớn; mỗi pha là một
 * component thuần được nối ở `PreJoinSection`/`StatusSections`/`InRoomView`. Media sống ở controller (`hooks/meeting-room.session.ts`), không
 * ở màn này — rời màn khi đang họp là THU NHỎ, không rớt.
 *
 * `useMeetingRoomRuntime` ở đây chỉ là DỰ PHÒNG: nơi giữ phòng chính là `MeetingRoomHost` (gắn toàn cục); hook tự nhường cho bản mount trước.
 */
function AuthenticatedMeetingRoom({ meetingId }: MeetingRoomScreenProps) {
  const phase = useMeetingRoomStore((state) => state.phase);
  const busyConflict = useMeetingRoomStore((state) => state.busyConflict);
  const busy = useMeetingRoomStore((state) => state.busy);
  const storeMeetingId = useMeetingRoomStore((state) => state.meetingId);
  const flow = useMeetingJoinFlow(meetingId);
  const exit = useExitMeetingRoom();
  const writeRecap = useWriteRecapFromRoom();
  const hostMounted = useHostMounted();
  useMeetingRoomRuntime();

  // Phím Back: ngoài phòng → thoát màn (dọn theo pha). Trong phòng để `InRoomView` lo (hộp thoại Rời/thu nhỏ) — trả `false` để nhường.
  // ⚠️ `CONNECTING` KHÔNG có `InRoomView` để nhường: trước đây Back rơi xuống navigator (gỡ màn, phiên vẫn nối ngầm). Có nơi giữ phòng ⇒
  // thu nhỏ như trong phòng; không có (mở bằng deep link khi `(app)` chưa mount) ⇒ huỷ hẳn — không để cuộc họp sống mà không có đường quay lại.
  const onBack = useCallback((): boolean => {
    const current = useMeetingRoomStore.getState().phase;
    if (current === 'CONNECTING') {
      if (hostMounted) void exit();
      else void cancelConnecting(meetingId);
      return true;
    }
    if (isInRoomPhase(current)) return false;
    void exit();
    return true;
  }, [exit, hostMounted, meetingId]);
  useRoomBackHandler(onBack);

  // Lưới an toàn: màn bị gỡ khi phòng còn chạy mà KHÔNG qua "Thu nhỏ" (route bị thay, hot reload…) ⇒ đánh dấu thu nhỏ để MiniBar hiện — không bao giờ
  // để một cuộc họp sống mà người dùng không thấy đường quay lại. Rời/kết thúc đã reset store trước nên không đụng gì ở đây.
  useEffect(
    () => () => {
      const { meetingId: current, phase: last } = useMeetingRoomStore.getState();
      if (current === meetingId && isInRoomPhase(last)) meetingRoomApi.patch({ minimized: true });
    },
    [meetingId],
  );

  if (flow.needsSwitch) {
    return (
      <>
        <RoomLoading onExit={() => navigateOutOfRoom(meetingId)} />
        <BusyConflictDialog
          sameDevice={false}
          visible
          onCancel={() => navigateOutOfRoom(meetingId)}
          onConfirm={() => void flow.confirmSwitch()}
        />
      </>
    );
  }
  if (storeMeetingId !== meetingId) return <RoomLoading onExit={() => void exit()} />;

  return (
    <>
      <PhaseView flow={flow} meetingId={meetingId} phase={phase} onExit={() => void exit()} onWriteRecap={() => void writeRecap()} />
      <BusyConflictDialog
        loading={busy}
        sameDevice={busyConflict?.sameDevice ?? false}
        visible={busyConflict !== null}
        onCancel={() => meetingRoomApi.patch({ busyConflict: null })}
        onConfirm={() => void flow.confirmBusyConflict()}
      />
    </>
  );
}

/** Cổng đăng nhập: CHƯA đăng nhập thì chuyển sang `/login` TRƯỚC khi chạy bất kỳ hook nào của phòng (không gọi API, không mở socket). */
export function MeetingRoomScreen({ meetingId }: MeetingRoomScreenProps) {
  const authStatus = useAuthStore((state) => state.status);
  if (appConfig.authEnabled && authStatus !== 'authenticated') return <Redirect href={PATHS.LOGIN} />;
  return <AuthenticatedMeetingRoom meetingId={meetingId} />;
}
