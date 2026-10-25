import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { answerCall, declineCall, hangUp } from '../hooks/call-actions';
import { useCallControls } from '../hooks/useCallControls';
import { useCallSession } from '../hooks/useCallSession';
import { useCallForegroundService } from '../hooks/useCallForegroundService';
import { useCallKeepAwake } from '../hooks/useCallKeepAwake';
import { useCallSignals } from '../hooks/useCallSignals';
import { useCallTimer } from '../hooks/useCallTimer';
import { useLockScreenCall } from '../hooks/useLockScreenCall';
import { useCallMediaStore } from '../store/call-media.store';
import { useCallStore } from '../store/call.store';
import { directPeerFallback } from '../utils/call-peer';
import { endedText } from '../utils/call-messages';
import { formatDuration } from '../utils/call-outcome';
import { ActiveCallControls } from '../components/ActiveCallControls';
import { CallPeerHeader } from '../components/CallPeerHeader';
import { CallScreenBackdrop } from '../components/CallScreenBackdrop';
import { CallStage } from '../components/CallStage';
import { IncomingCallActions } from '../components/IncomingCallActions';

/**
 * Màn cuộc gọi của root `IncomingCall` — bản bung ra TRÊN MÀN KHOÁ (`IncomingCallActivity`).
 *
 * ⛔ Vì sao không dùng thẳng `CallScreen`: màn đó là một ROUTE của `expo-router` (`Redirect`,
 * `router.back()`, `useLocalSearchParams`). Root này cố ý KHÔNG có cây điều hướng — hai
 * `NavigationContainer` trong cùng một JS runtime là hỏng. Ở đây chỉ còn đúng ba pha mà màn
 * khoá cần: đổ chuông → đang nói → đã kết thúc, vẽ bằng chính các khối của `CallScreen`.
 *
 * Mọi thứ khác (API, store, media) dùng CHUNG với cây `main` — cùng một JS runtime.
 */
export function LockScreenCallScreen() {
  const stage = useLockScreenCall();
  // Chủ sở hữu phiên media khi màn này đang sống (xem `call-surface.store.ts`).
  useCallSession('lockscreen');
  // Tín hiệu `call:*` qua socket — root này không có `(app)/_layout.tsx` để mount hộ.
  useCallSignals();
  useCallKeepAwake();
  useCallForegroundService();

  const queryClient = useQueryClient();
  const meId = useAuthStore((state) => state.user?.id) ?? null;
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const incoming = useCallStore((state) => state.incoming);
  const answering = useCallStore((state) => state.answering);
  const endedInfo = useCallStore((state) => state.endedInfo);
  const connection = useCallMediaStore((state) => state.connection);
  const participants = useCallMediaStore((state) => state.participants);
  const controls = useCallControls();
  const clock = useCallTimer();

  if (stage !== 'ready') {
    // Đang khôi phục phiên/hỏi BE, hoặc đã xong việc và Activity sắp đóng. Nền ĐẶC cùng màu màn
    // gọi để không loé một khung hình trắng trên màn khoá.
    return <View className="flex-1 bg-nav-to" />;
  }

  const source = call ?? incoming;
  const video = source?.mediaKind === 'VIDEO';
  const ended = `${endedText(endedInfo?.reason)}${
    endedInfo?.reason === 'COMPLETED' && endedInfo.durationSec
      ? ` · ${formatDuration(endedInfo.durationSec)}`
      : ''
  }`;
  const peer = source ? directPeerFallback(source, meId) : null;

  async function answer(): Promise<void> {
    const failure = await answerCall(queryClient);
    if (failure && failure.kind !== 'ANSWERED_ELSEWHERE' && failure.kind !== 'STATE_CHANGED') {
      showToast('error', failure.message);
    }
  }

  return (
    // Cùng khuôn nền với `CallScreen`: `bg-nav-to` là màu ĐẶC, luôn tối ở cả hai chế độ sáng/tối
    // — khớp với chữ luôn trắng `fg-on-nav*` của `CallPeerHeader`.
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
        <View className="flex-1">
          <CallPeerHeader
            avatarUrl={source?.scope.avatarUrl ?? peer?.avatarUrl ?? null}
            ringing={phase === 'incoming' || phase === 'connecting'}
            status={statusText(phase, video, connection === 'reconnecting', clock, ended)}
            title={source?.scope.title || peer?.name || 'Cuộc gọi'}
          />
          <CallStage
            media={participants}
            meId={meId}
            participants={call?.participants ?? []}
            video={video}
          />
        </View>
        {phase === 'incoming' ? (
          <IncomingCallActions
            answering={answering}
            onAnswer={() => void answer()}
            onDecline={() => void declineCall(queryClient)}
          />
        ) : phase === 'ended' ? (
          <Text className="px-lg pb-xl text-center text-body-md text-fg-on-nav-muted">{ended}</Text>
        ) : (
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
        )}
      </View>
    </Screen>
  );
}

function statusText(
  phase: string,
  video: boolean,
  reconnecting: boolean,
  clock: string,
  ended: string,
): string {
  if (phase === 'incoming') return video ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến';
  if (phase === 'connecting') return 'Đang kết nối…';
  if (phase === 'active') return reconnecting ? 'Đang kết nối lại…' : clock;
  return ended;
}
