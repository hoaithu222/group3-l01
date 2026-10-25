import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { CallParticipantDto } from '../../api/calls.types';
import { CallParticipantTiles } from '../../components/CallParticipantTiles';
import { CallScreenBackdrop } from '../../components/CallScreenBackdrop';
import { useCallTimer } from '../../hooks/useCallTimer';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi, useCallStore } from '../../store/call.store';
import type { HostAction } from '../api/voice-room.types';
import { HostLeaveDialog } from '../components/HostLeaveDialog';
import { HostParticipantMenu } from '../components/HostParticipantMenu';
import { RemovedFromRoomView } from '../components/RemovedFromRoomView';
import { RoomChatSheet } from '../components/RoomChatSheet';
import { RoomParticipantsSheet } from '../components/RoomParticipantsSheet';
import { VoiceRoomControls } from '../components/VoiceRoomControls';
import { VoiceRoomNotices } from '../components/VoiceRoomNotices';
import { leaveRoom, runHostAction, setHandRaised } from '../hooks/voice-room.actions';
import { useRoomControls } from '../hooks/useRoomControls';
import { useVoiceRoomStore } from '../store/voice-room.store';

export interface VoiceRoomScreenProps {
  /** Nội dung chat của kênh (do nơi lắp ráp cấp — `calls` không import `chat`). Vắng ⇒ ẩn nút Chat. */
  renderRoomChat?: (channelId: string) => ReactNode;
}

type Sheet = 'chat' | 'leave' | 'participants' | null;

const HOST_DONE: Partial<Record<HostAction, string>> = {
  BLOCK_AUDIO: 'Đã chặn phát biểu',
  INVITE_SPEAK: 'Đã mời phát biểu',
  MUTE_REQUEST: 'Đã gửi yêu cầu tắt mic',
  REMOVE: 'Đã mời ra khỏi phòng',
  TRANSFER: 'Đã chuyển quyền chủ phòng',
  UNBLOCK_AUDIO: 'Đã cho phép phát biểu lại',
};

/**
 * Màn PHÒNG THOẠI kênh (layout `mode = ROOM` của `CallScreen`, app.md §3): lưới người + nhãn chủ phòng/giơ tay, lời nhắc của chủ phòng,
 * thanh điều khiển, danh sách người (chủ phòng có menu ⋯), hộp thoại rời của chủ phòng, chat phòng (tấm trượt; máy tính bảng: khung cạnh lưới).
 * Vòng đời media KHÔNG nằm ở đây (`useCallSession` ở `CallHost`) nên thu nhỏ/rời màn không làm rớt âm thanh.
 */
export function VoiceRoomScreen({ renderRoomChat }: VoiceRoomScreenProps) {
  const queryClient = useQueryClient();
  const meId = useAuthStore((state) => state.user?.id) ?? null;
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const endedInfo = useCallStore((state) => state.endedInfo);
  const connection = useCallMediaStore((state) => state.connection);
  const micDenied = useCallMediaStore((state) => state.micDenied);
  const media = useCallMediaStore((state) => state.participants);
  const videoDisabled = useVoiceRoomStore((state) => state.videoDisabled);
  const controls = useRoomControls();
  const clock = useCallTimer();
  const { isTablet } = useBreakpoint();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [target, setTarget] = useState<CallParticipantDto | null>(null);
  const [busy, setBusy] = useState(false);

  const participants = call?.participants ?? [];
  const inRoom = participants.filter((p) => p.state === 'CONNECTED' || p.state === 'JOINING' || p.state === 'RECONNECTING');
  const me = participants.find((p) => p.userId === meId);
  const isHost = meId !== null && call?.hostId === meId;
  const channelId = call?.scopeId ?? '';

  if (phase === 'ended') {
    return (
      <Screen gradient={false}>
        <RemovedFromRoomView reason={endedInfo?.reason} onClose={() => callStoreApi.dispatch({ type: 'DISMISS' })} />
      </Screen>
    );
  }

  const status = phase === 'active' ? `${connection === 'reconnecting' ? 'Đang kết nối lại…' : clock} · ${String(inRoom.length)} người` : 'Đang vào phòng…';

  async function hostAction(action: HostAction, person: CallParticipantDto): Promise<void> {
    setBusy(true);
    const failure = await runHostAction(action, person);
    setBusy(false);
    if (failure) {
      showToast('error', failure.kind === 'STATE_CHANGED' ? 'Trạng thái phòng đã thay đổi' : failure.message);
      return;
    }
    setTarget(null);
    const done = HOST_DONE[action];
    if (done) showToast('success', done);
  }

  async function toggleHand(): Promise<void> {
    if (!meId) return;
    const failure = await setHandRaised(meId, !me?.handRaisedAt);
    if (failure) showToast('error', failure.message);
  }

  function leave(options: Parameters<typeof leaveRoom>[0]): void {
    setSheet(null);
    void leaveRoom(options, queryClient);
  }

  return (
    // ⛔ KHÔNG `bg-bg-nav` (đã từng dùng, cùng lỗi đã vá ở `CallScreen`): đó là nền "bottom bar", gần-trắng ở chế độ
    // sáng, trong khi chữ ở đây LUÔN trắng (`fg-on-nav*`) ⇒ tan biến. `bg-nav-to` LUÔN tối ở cả hai chế độ (cặp với
    // `CallScreenBackdrop`, cùng token `nav-from/nav-to` dùng cho `CallScreen`) — nền gốc khớp màu dải đệm an toàn,
    // gradient thật vẽ ở lớp trong. Chữ thanh trạng thái `light` vì nền LUÔN tối.
    <Screen className="bg-nav-to" constrained={false} gradient={false} padded={false} scrollable={false}>
      <StatusBar style="light" />
      <View className="flex-1 flex-row bg-nav-to">
        <View
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <CallScreenBackdrop />
        </View>
        <View className="flex-1 justify-between">
          <View>
            <View className="items-center gap-3xs px-lg py-md">
              <Text className="text-center text-header-sm text-fg-on-nav" numberOfLines={1}>
                {call?.scope.title ? `#${call.scope.title}` : 'Phòng thoại'}
              </Text>
              <Text accessibilityLiveRegion="polite" className="text-body-md text-fg-on-nav-muted">
                {status}
              </Text>
            </View>
            <VoiceRoomNotices
              micDenied={!controls.micOn && micDenied}
              reconnecting={connection === 'reconnecting'}
              onEnableMic={() => void controls.toggleMic()}
              onMuteMic={() => void controls.muteMic()}
            />
            <CallParticipantTiles hostId={call?.hostId ?? null} media={media} meId={meId} participants={participants} />
            {inRoom.length <= 1 ? (
              <Text className="px-lg pt-md text-center text-body-md text-fg-on-nav-muted">Bạn là người đầu tiên — mời mọi người vào kênh.</Text>
            ) : null}
          </View>
          <View>
            <VoiceRoomControls
              audioBlocked={controls.audioBlocked}
              cameraOn={controls.cameraOn}
              handRaised={Boolean(me?.handRaisedAt)}
              micOn={controls.micOn}
              participantCount={inRoom.length}
              showCamera={!videoDisabled}
              speakerOn={controls.speakerOn}
              onLeave={() => (isHost ? setSheet('leave') : leave({}))}
              onOpenChat={renderRoomChat ? () => setSheet(sheet === 'chat' ? null : 'chat') : undefined}
              onOpenParticipants={() => setSheet('participants')}
              onToggleCamera={() => void controls.toggleCamera()}
              onToggleHand={() => void toggleHand()}
              onToggleMic={() => void controls.toggleMic()}
              onToggleSpeaker={() => void controls.toggleSpeaker()}
            />
          </View>
        </View>
        {isTablet && sheet === 'chat' && renderRoomChat ? (
          <View className="w-96 border-l border-l-divider-1 bg-bg-1">{renderRoomChat(channelId)}</View>
        ) : null}
      </View>

      <RoomParticipantsSheet
        hostId={call?.hostId ?? null}
        isHost={isHost}
        meId={meId}
        participants={participants}
        visible={sheet === 'participants'}
        onClose={() => setSheet(null)}
        onOpenMenu={(person) => {
          setSheet(null);
          setTarget(person);
        }}
      />
      <HostParticipantMenu busy={busy} target={target} onAction={(a, p) => void hostAction(a, p)} onClose={() => setTarget(null)} />
      <HostLeaveDialog
        busy={busy}
        candidates={inRoom.filter((p) => p.state === 'CONNECTED' && p.userId !== meId)}
        visible={sheet === 'leave'}
        onClose={() => setSheet(null)}
        onEndForEveryone={() => leave({ endForEveryone: true })}
        onLeaveAuto={() => leave({})}
        onTransfer={(userId) => leave({ transferToUserId: userId })}
      />
      {renderRoomChat && !isTablet ? (
        <RoomChatSheet channelId={channelId} renderChat={renderRoomChat} visible={sheet === 'chat'} onClose={() => setSheet(null)} />
      ) : null}
    </Screen>
  );
}
