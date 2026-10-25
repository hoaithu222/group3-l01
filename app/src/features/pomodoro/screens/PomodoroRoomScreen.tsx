import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import type { PomodoroCommandKind } from '../api/pomodoro.types';
import { GoalSheet } from '../components/GoalSheet';
import { PomodoroConfigSheet } from '../components/PomodoroConfigSheet';
import { PomodoroDialogs } from '../components/PomodoroDialogs';
import { PomodoroFallback } from '../components/PomodoroFallback';
import { PomodoroMediaBar } from '../components/PomodoroMediaBar';
import { PomodoroPreview } from '../components/PomodoroPreview';
import { PomodoroPreviewBar } from '../components/PomodoroPreviewBar';
import { PomodoroRoomView } from '../components/PomodoroRoomView';
import { SessionSummarySheet } from '../components/SessionSummarySheet';
import { useKeepAwakeInRoom } from '../hooks/useKeepAwakeInRoom';
import { usePomodoroCommand } from '../hooks/usePomodoroCommand';
import { usePomodoroMedia } from '../hooks/usePomodoroMedia';
import { usePomodoroRoom } from '../hooks/usePomodoroRoom';
import { usePomodoroSnapshot } from '../hooks/usePomodoroSnapshot';
import { useRoomBackHandler } from '../hooks/useRoomBackHandler';
import { usePomodoroResult } from '../queries/pomodoro.queries';
import { usePomodoroStore } from '../store/pomodoro.store';
import { isMicLocked } from '../utils/phase';

export interface PomodoroRoomScreenProps {
  channelId: string;
  /** Thanh tiêu đề của kênh (tìm/ghim/thành viên/thông tin) do route cấp — `pomodoro` không import `channels`. Vắng ⇒ thanh tiêu đề đơn giản. */
  header?: ReactNode;
  wsId: string;
}

type Sheet = 'config' | 'goal';

const isNotFound = (error: unknown): boolean => isAxiosError(error) && error.response?.status === 404;

/**
 * Màn KÊNH POMODORO (app.md p5-02 §1, §3): preview ↔ trong phòng. Chạm kênh chỉ mở PREVIEW (không xin quyền, không vào phòng); "Vào học" mới là ý định
 * vào. Trong phòng: đồng hồ theo server, điều khiển chủ phòng theo `myActions`, thanh media với mic khoá khi tập trung. Rời màn = rời phòng (không có
 * thanh thu nhỏ). Phiên kết thúc lúc tôi đang ở trong phòng ⇒ tấm "Kết quả phiên". Cờ `pomodoro` do route (`FeatureRouteGuard`) chặn; mất quyền/404 ⇒ về danh sách kênh.
 */
export function PomodoroRoomScreen({ channelId, header: channelHeader, wsId }: PomodoroRoomScreenProps) {
  const queryClient = useQueryClient();
  const offline = useConnectionState() === 'offline';
  const myId = useAuthStore((state) => state.user?.id);
  const live = usePomodoroSnapshot(channelId, true);
  const roomApi = usePomodoroRoom(channelId);
  const command = usePomodoroCommand(channelId);
  const { connection, failed, inRoom } = usePomodoroStore(
    useShallow((state) => ({
      connection: state.room.connection,
      failed: state.room.failed,
      inRoom: state.room.channelId === channelId && state.room.callId !== null,
    })),
  );
  const ended = usePomodoroStore((state) => (state.ended?.channelId === channelId ? state.ended : null));
  const { snapshot } = live;
  const micLocked = snapshot ? isMicLocked(snapshot, myId) : false;
  const media = usePomodoroMedia(micLocked);
  const result = usePomodoroResult(channelId, ended?.sessionId ?? null, ended !== null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useKeepAwakeInRoom(inRoom);
  const askLeave = useCallback(() => {
    setLeaveOpen(true);
    return true;
  }, []);
  useRoomBackHandler(inRoom, askLeave);

  const header = channelHeader ?? <AppBar title="Phòng Pomodoro" onBack={router.back} />;
  const fallback = (kind: 'error' | 'gone' | 'loading') => (
    <PomodoroFallback
      description={kind === 'error' ? toErrorMessage(live.error) : undefined}
      header={header}
      kind={kind}
      onRetry={() => void live.refetch()}
      onToChannels={() => router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]/channels' })}
    />
  );
  if (live.room.status === 'denied' || isNotFound(live.error)) return fallback('gone');
  if (!snapshot) return fallback(live.isError ? 'error' : 'loading');

  const runCommand = (kind: PomodoroCommandKind) => void command.run(kind, snapshot.version);
  /** "Bắt đầu" ở preview: vào phòng TRƯỚC (mở phiên WAITING, tôi là chủ) rồi mới chạy vòng đầu — chủ phòng luôn ở trong phòng. */
  const startNow = async () => {
    const joined = await roomApi.join();
    if (joined?.myActions?.canStart) await command.run('start', joined.version);
  };
  const closeSummary = () => {
    usePomodoroStore.getState().clearEnded();
    void roomApi.leave();
    void queryClient.invalidateQueries({ queryKey: pomodoroKeys.snapshot(channelId) });
  };

  return (
    <Screen
      footer={
        inRoom ? (
          <PomodoroMediaBar
            cameraOn={media.cameraOn}
            connected={connection === 'connected'}
            micLocked={micLocked}
            micOn={media.micOn}
            showCamera={snapshot.rules.cameraAllowed}
            speakerOn={media.speakerOn}
            onLeave={askLeave}
            onToggleCamera={() => void media.toggleCamera()}
            onToggleMic={() => void media.toggleMic()}
            onToggleSpeaker={() => void media.toggleSpeaker()}
          />
        ) : (
          <PomodoroPreviewBar
            actions={snapshot.myActions}
            failure={roomApi.failure}
            noSession={snapshot.sessionId === null}
            offline={offline}
            pending={roomApi.pending}
            onJoin={() => void roomApi.join()}
            onStartNow={() => void startNow()}
          />
        )
      }
      header={header}
      refreshing={live.isRefetching}
      onRefresh={() => void live.refetch()}
    >
      {inRoom ? (
        <>
          {roomApi.failure ? (
            <View className="pt-md">
              <Alert description={roomApi.failure} tone="error" onClose={roomApi.dismissFailure} />
            </View>
          ) : null}
          <PomodoroRoomView
            busyKind={command.pendingKind}
            channelId={channelId}
            connection={{ connection, failed, retrying: roomApi.pending, onRetry: () => void roomApi.join() }}
            myId={myId}
            offline={offline}
            snapshot={snapshot}
            onConfigure={() => setSheet('config')}
            onEditGoal={() => setSheet('goal')}
            onRunCommand={runCommand}
          />
        </>
      ) : (
        <PomodoroPreview channelId={channelId} myId={myId} offline={offline} snapshot={snapshot} onConfigure={() => setSheet('config')} />
      )}

      <PomodoroConfigSheet channelId={channelId} offline={offline} snapshot={snapshot} visible={sheet === 'config'} onClose={() => setSheet(null)} />
      <GoalSheet channelId={channelId} offline={offline} snapshot={snapshot} visible={sheet === 'goal'} onClose={() => setSheet(null)} />
      <SessionSummarySheet fallback={snapshot.summary} loading={result.isLoading} result={result.data} visible={ended !== null} onClose={closeSummary} />
      <PomodoroDialogs
        isHost={myId !== undefined && snapshot.hostUserId === myId}
        leaveOpen={leaveOpen}
        switchOpen={roomApi.switchPrompt}
        onCloseLeave={() => setLeaveOpen(false)}
        onConfirmLeave={() => {
          setLeaveOpen(false);
          void roomApi.leave();
        }}
        onConfirmSwitch={() => void roomApi.confirmSwitch()}
        onDismissSwitch={roomApi.dismissSwitch}
      />
    </Screen>
  );
}
