import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { LinkButton } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config';
import { useAuthStore } from '@/shell/store/slices/auth';

import { answerCall, endCallForEveryone, hangUp, declineCall } from '../hooks/call-actions';
import { useCallControls } from '../hooks/useCallControls';
import { useCallTimer } from '../hooks/useCallTimer';
import { useCallMediaStore } from '../store/call-media.store';
import { callStoreApi, useCallStore } from '../store/call.store';
import { formatDuration } from '../utils/call-outcome';
import { endedText } from '../utils/call-messages';
import { directPeerFallback } from '../utils/call-peer';
import { ActiveCallControls } from '../components/ActiveCallControls';
import { CallPeerHeader } from '../components/CallPeerHeader';
import { CallStage } from '../components/CallStage';
import { CallScreenBackdrop } from '../components/CallScreenBackdrop';
import { IncomingCallActions } from '../components/IncomingCallActions';
import { VoiceRoomScreen } from '../voice-room/screens/VoiceRoomScreen';

function statusText(phase: string, video: boolean, reconnecting: boolean, clock: string, ended: string): string {
  switch (phase) {
    case 'incoming':
      return video ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến';
    case 'outgoing':
      return 'Đang gọi…';
    case 'connecting':
      return 'Đang kết nối…';
    case 'active':
      return reconnecting ? 'Đang kết nối lại…' : clock;
    default:
      return ended;
  }
}

/**
 * Màn cuộc gọi TOÀN MÀN (`call/[callId]`, README p2-01 §1) theo pha của `callStore`: đến → Trả lời/Từ chối; đi → Huỷ;
 * đang gọi → điều khiển; kết thúc → lý do + thời lượng (giữ ~2 giây, `CallHost` dọn). UI trong cuộc gọi đầy đủ (PiP, Bluetooth,
 * CallKit) là của p2-02 — đây là bản đủ dùng cho luồng đổ chuông → trả lời → kết thúc. Rời màn khi đang gọi = THU NHỎ (media
 * sống ở `useCallSession`, không rớt).
 */
export interface CallScreenProps {
  /** Chat của kênh cho phòng thoại (p2-03) — do nơi lắp ráp (route `call/[callId]`) cấp vì `calls` không import feature `chat`. */
  renderRoomChat?: (channelId: string) => ReactNode;
}

export function CallScreen({ renderRoomChat }: CallScreenProps = {}) {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const meId = useAuthStore((state) => state.user?.id) ?? null;
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const incoming = useCallStore((state) => state.incoming);
  const answering = useCallStore((state) => state.answering);
  const endedInfo = useCallStore((state) => state.endedInfo);
  const connection = useCallMediaStore((state) => state.connection);
  const micDenied = useCallMediaStore((state) => state.micDenied);
  const participants = useCallMediaStore((state) => state.participants);
  const controls = useCallControls();
  const clock = useCallTimer();

  const live = phase === 'outgoing' || phase === 'incoming' || phase === 'connecting' || phase === 'active';
  useEffect(() => {
    if (live) callStoreApi.dispatch({ minimized: false, type: 'MINIMIZE' });
    return () => {
      if (callStoreApi.get().phase !== 'idle') callStoreApi.dispatch({ minimized: true, type: 'MINIMIZE' });
    };
  }, [live]);
  // Về `idle` (sau màn "đã kết thúc") thì rời màn — `CallHost` đã DISMISS.
  useEffect(() => {
    if (phase === 'idle' && router.canGoBack()) router.back();
  }, [phase]);

  if (appConfig.authEnabled && authStatus !== 'authenticated') return <Redirect href={PATHS.LOGIN} />;
  if (phase === 'idle') {
    return (
      <Screen gradient={false}>
        <EmptyState
          actions={[{ label: 'Đóng', onPress: () => router.back() }]}
          description="Cuộc gọi này không còn diễn ra."
          icon="phone"
          title="Cuộc gọi đã kết thúc"
          tone="neutral"
        />
      </Screen>
    );
  }

  // Phòng thoại kênh (mode ROOM, p2-03): không đổ chuông/không "Kết thúc cho mọi người" kiểu nhóm — layout riêng.
  if (call?.mode === 'ROOM') return <VoiceRoomScreen renderRoomChat={renderRoomChat} />;

  const source = call ?? incoming;
  const video = source?.mediaKind === 'VIDEO';
  const ended = `${endedText(endedInfo?.reason)}${endedInfo?.reason === 'COMPLETED' && endedInfo.durationSec ? ` · ${formatDuration(endedInfo.durationSec)}` : ''}`;
  // `scope.title`/`scope.avatarUrl` đã resolve đúng góc nhìn người xem ở BE — dự phòng khi rỗng (race lúc tạo/nhận
  // cuộc gọi) lấy người CÒN LẠI trong cuộc gọi (`directPeerFallback`), KHÔNG lấy `initiator` (xem chú thích ở đó).
  const peerFallback = source ? directPeerFallback(source, meId) : null;
  const fallbackTitle =
    peerFallback?.name ??
    (source?.scope.kind === 'CHANNEL' ? 'Cuộc gọi kênh' : source?.scope.kind === 'MEETING' ? 'Cuộc họp' : source?.scope.kind === 'GROUP' ? 'Cuộc gọi nhóm' : 'Cuộc gọi');

  async function answer(): Promise<void> {
    const failure = await answerCall(queryClient);
    if (failure && failure.kind !== 'ANSWERED_ELSEWHERE' && failure.kind !== 'STATE_CHANGED') showToast('error', failure.message);
  }

  async function endForAll(): Promise<void> {
    const failure = await endCallForEveryone(queryClient);
    if (failure) showToast('error', failure.message);
  }

  return (
    // ⚠️ Không có `header` ⇒ `Screen` tự đệm `insets.top/bottom` quanh thân — hai dải đệm đó lấy màu nền của CHÍNH
    // `Screen` (`className` dưới đây), nên phải khớp màu với khối `flex-1` bên trong để liền một mảng. `bg-nav-to` là
    // màu ĐẶC, LUÔN tối ở cả hai chế độ sáng/tối (⛔ khác `bg-nav` — nền của "bottom bar", gần-trắng ở chế độ sáng, xem
    // `CallScreenBackdrop`) — khớp với chữ LUÔN TRẮNG `fg-on-nav*` của `CallPeerHeader`. Dải gradient thật
    // (`CallScreenBackdrop`) phủ lớp TRONG, không tới được hai dải đệm ngoài `flex-1` — chấp nhận được vì chúng chỉ là
    // viền mỏng sát thanh trạng thái/vạch cử chỉ. Chữ thanh trạng thái: nền luôn tối ⇒ `light` (gốc `auto` ở chế độ
    // sáng cho chữ ĐEN trên nền tối, đồng hồ/pin biến mất).
    <Screen className="bg-nav-to" constrained={false} gradient={false} padded={false} scrollable={false}>
      <StatusBar style="light" />
      <View className="flex-1 justify-between bg-nav-to">
        <View
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <CallScreenBackdrop />
        </View>
        {/* `flex-1`: khối đầu phải NUỐT hết chỗ trống thì `CallStage` của cuộc gọi video mới có
            chiều cao để vẽ ô lớn. Gọi thoại không đổi gì (nội dung vẫn bám mép trên). */}
        <View className="flex-1">
          <CallPeerHeader
            avatarUrl={source?.scope.avatarUrl ?? peerFallback?.avatarUrl ?? null}
            // Đổ chuông/đang kết nối mới lan toả vòng sóng — vào `active` rồi thì tắt cho đỡ hao pin (xem `CallAvatarPulse`).
            ringing={phase === 'incoming' || phase === 'outgoing' || phase === 'connecting'}
            status={statusText(phase, video, connection === 'reconnecting', clock, ended)}
            title={source?.scope.title || fallbackTitle}
          />
          {micDenied && phase === 'active' ? (
            <Text className="px-lg pb-sm text-center text-caption-sm text-fg-on-nav-muted">
              Chưa có quyền micro — bạn chỉ nghe được.
            </Text>
          ) : null}
          <CallStage media={participants} meId={meId} participants={call?.participants ?? []} video={video} />
        </View>
        {phase === 'incoming' ? (
          <IncomingCallActions answering={answering} onAnswer={() => void answer()} onDecline={() => void declineCall(queryClient)} />
        ) : phase === 'ended' ? null : (
          <View>
            {phase === 'active' && call?.scope.kind !== 'DIRECT' && call?.myActions.canEnd ? (
              <View className="items-center pb-sm">
                <LinkButton label="Kết thúc cho mọi người" tone="white" onPress={() => void endForAll()} />
              </View>
            ) : null}
          <ActiveCallControls
            cameraOn={controls.cameraOn}
            micOn={controls.micOn}
            speakerOn={controls.speakerOn}
            video={video}
            onFlipCamera={() => void controls.flipCamera()}
            onHangUp={() => void hangUp(queryClient)}
            onToggleCamera={() => void controls.toggleCamera()}
            onToggleMic={() => void controls.toggleMic()}
            onToggleSpeaker={() => void controls.toggleSpeaker()}
          />
          </View>
        )}
      </View>
    </Screen>
  );
}
