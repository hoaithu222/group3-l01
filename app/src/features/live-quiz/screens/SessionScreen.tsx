import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { LiveQuizCommand } from '../api/live-quiz.api';
import { AbortSessionDialog } from '../components/AbortSessionDialog';
import { LiveLeaderboard } from '../components/LiveLeaderboard';
import { LobbyPanel } from '../components/LobbyPanel';
import { QuestionStage } from '../components/QuestionStage';
import { SessionHostFooter } from '../components/SessionHostFooter';
import { SessionUnavailable, type UnavailableKind } from '../components/SessionUnavailable';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { useLiveQuizSession } from '../hooks/useLiveQuizSession';
import { useHostCommand, useKickPlayer } from '../queries/live-quiz.queries';
import { resultsHref } from '../utils/live-quiz-routes';
import { quizErrorCode, quizErrorMessage } from '../utils/quiz-errors';

/**
 * Màn phiên — điều phối theo `status`/`phase` + vai trò (app.md p5-01 §3). Vai trò host = snapshot có `pin` (BE chỉ
 * trả PIN cho host). Kết thúc (`quiz:ended` FINISHED) ⇒ thay bằng màn kết quả.
 *
 * ⚠️ Thanh đáy của host chỉ có MỘT nút (bước kế tiếp của phiên — `SessionHostFooter`). "Huỷ phòng"/"Kết thúc phiên" là thao tác
 * PHÁ HUỶ ảnh hưởng mọi người chơi nên nằm trong menu "⋯" ở thanh tiêu đề và luôn hỏi xác nhận — trước đây nó là nút đỏ nằm ngay
 * dưới "Kết thúc câu", một cú chạm trượt là đóng phòng của cả lớp.
 */
export function SessionScreen() {
  const { sessionId = '' } = useLocalSearchParams<{ sessionId: string }>();
  const { offsetMs, room, snapshot } = useLiveQuizSession(sessionId);
  const command = useHostCommand(sessionId);
  const kick = useKickPlayer(sessionId);
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const myId = useAuthStore((state) => state.user?.id);
  const data = snapshot.data;
  const isHost = Boolean(data?.pin);
  const status = data?.status;
  // Giữ màn sáng suốt lúc chơi (host lẫn người chơi) — `expo-keep-awake`, xem hook.
  useKeepScreenAwake(status === 'IN_PROGRESS');

  useEffect(() => {
    if (status === 'FINISHED') router.replace(resultsHref(sessionId));
  }, [sessionId, status]);

  function run(cmd: LiveQuizCommand): void {
    if (!data) return;
    command.mutate(
      { command: cmd, expectedVersion: data.version },
      { onError: (error) => showToast('error', quizErrorMessage(error)) },
    );
  }

  const lobby = data?.phase === 'LOBBY';
  const canAbort = isHost && data !== undefined;
  const header = (
    <AppBar
      actions={
        canAbort ? (
          <ActionMenu
            accessibilityLabel="Tuỳ chọn phòng thi"
            items={[
              {
                icon: 'cancel',
                key: 'abort',
                label: lobby ? 'Huỷ phòng' : 'Kết thúc phiên',
                tone: 'danger',
                onPress: () => setConfirmingAbort(true),
              },
            ]}
          />
        ) : undefined
      }
      title={isHost ? 'Chủ phòng thi' : 'Thi đấu trực tiếp'}
      onBack={router.back}
    />
  );

  if (snapshot.isLoading) {
    return (
      <Screen header={header}>
        <Skeleton className="mt-md h-56 rounded-md" />
      </Screen>
    );
  }

  // Bị mời ra: BE rút socket khỏi phòng (không báo riêng) rồi phát `quiz:lobby` thiếu tôi ⇒ suy từ danh sách người chơi.
  const removed =
    !isHost && Boolean(myId) && data !== undefined && !data.players.some((p) => p.userId === myId);
  const kicked =
    removed || room.status === 'denied' || quizErrorCode(snapshot.error) === 'QUIZ_010';
  if (!data || kicked || status === 'CANCELLED') {
    // Bị mời ra / phiên đã huỷ = KHOÁ (thử lại vô ích, tông cam); còn lại là lỗi tải thật (đỏ).
    const kind: UnavailableKind = kicked
      ? 'kicked'
      : status === 'CANCELLED'
        ? 'cancelled'
        : 'error';
    return (
      <Screen header={header}>
        <SessionUnavailable
          description={
            kind === 'kicked'
              ? 'Chủ phòng đã mời bạn ra khỏi phiên này.'
              : kind === 'cancelled'
                ? 'Chủ phòng đã huỷ phiên thi.'
                : quizErrorMessage(snapshot.error, 'Không tải được phiên thi.')
          }
          kind={kind}
          title={kicked ? 'Bạn đã bị mời ra' : 'Phiên thi không còn khả dụng'}
        />
      </Screen>
    );
  }

  return (
    <Screen
      constrained={false}
      footer={
        isHost && data.phase !== 'ENDED' ? (
          <SessionHostFooter data={data} pending={command.isPending} onRun={run} />
        ) : undefined
      }
      header={header}
      refreshing={snapshot.isRefetching}
      onRefresh={() => void snapshot.refetch()}
    >
      <View className="gap-md py-md">
        {data.phase === 'LOBBY' ? (
          <LobbyPanel
            isHost={isHost}
            kickingId={kick.isPending ? kick.variables : undefined}
            pin={data.pin}
            players={data.players}
            onKick={isHost ? (userId) => kick.mutate(userId) : undefined}
          />
        ) : null}
        {(data.phase === 'QUESTION' || data.phase === 'REVEAL') && data.question ? (
          <QuestionStage
            key={data.question.index}
            isHost={isHost}
            offsetMs={offsetMs}
            question={data.question}
            sessionId={sessionId}
            snapshot={data}
          />
        ) : null}
        {data.phase === 'ENDED' ? (
          <LiveLeaderboard
            me={isHost ? null : data.me}
            players={data.players}
            rows={data.leaderboardTop}
            variant="podium"
          />
        ) : null}
      </View>
      <AbortSessionDialog
        lobby={lobby}
        pending={command.isPending}
        visible={confirmingAbort}
        onClose={() => setConfirmingAbort(false)}
        onConfirm={() => {
          setConfirmingAbort(false);
          run(lobby ? 'cancel' : 'end');
        }}
      />
    </Screen>
  );
}
