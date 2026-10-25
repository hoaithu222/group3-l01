import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { onRoomResync, SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { liveQuizKeys } from '../api/live-quiz.keys';
import type {
  LiveQuizSnapshot,
  QuizEndedEvent,
  QuizLeaderboardEvent,
  QuizLobbyEvent,
  QuizProgressEvent,
  QuizQuestionEvent,
  QuizRevealDto,
} from '../api/live-quiz.types';
import { useLiveQuizSnapshot } from '../queries/live-quiz.queries';
import { useLiveQuizStore } from '../store/live-quiz.store';
import { mergeMyScore } from '../utils/leaderboard';

/**
 * Snapshot + phòng `quiz:{id}` + patch cache theo `quiz:*` (app.md p5-01 §4).
 *
 * ⚠️ Phòng chỉ join SAU khi có snapshot: room guard `quiz` của BE chỉ cho người đã `join`/host vào — join sớm hơn là
 * `denied` giả. Reconnect ⇒ `onRoomResync` tải lại snapshot (câu có thể đã đổi trong lúc mất mạng — LQ-08).
 */
export function useLiveQuizSession(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  const snapshot = useLiveQuizSnapshot(sessionId);
  const key = liveQuizKeys.session(sessionId ?? '');
  const room = useRoomSubscription('quiz', sessionId, { enabled: Boolean(snapshot.data) });
  // Lệch đồng hồ đo NGAY trong `queryFn` (`withClockOffset`) — không đo lại ở render.
  const offsetMs = snapshot.data?.clockOffsetMs ?? 0;

  useEffect(() => {
    if (!sessionId) return undefined;
    return onRoomResync(() => {
      void queryClient.invalidateQueries({ queryKey: liveQuizKeys.session(sessionId) });
    });
  }, [queryClient, sessionId]);

  function patch(fn: (prev: LiveQuizSnapshot) => LiveQuizSnapshot): void {
    queryClient.setQueryData<LiveQuizSnapshot>(key, (prev) => (prev ? fn(prev) : prev));
  }

  useSocketEvent<QuizLobbyEvent>(SocketEvent.QUIZ_LOBBY, (payload) => {
    // BE gửi cả phòng CHỈ `{ sessionId, players, playersCount }` (không `pin`) — chỉ lấy danh sách người chơi; không bao giờ ghi
    // đè `pin`/`me` dù server cũ (payload dựng theo góc nhìn host) có lỡ kèm theo.
    if (payload.players) {
      patch((prev) => ({
        ...prev,
        players: payload.players ?? prev.players,
        playersCount: payload.playersCount ?? payload.players?.length ?? prev.playersCount,
      }));
    }
  });

  // Ghi nhớ câu hỏi + đáp án công bố vào store để "Ôn lại câu sai" sau phiên (BE không cho tải lại từng câu).
  // Cũng ghi câu HIỆN TẠI của snapshot: vào giữa phiên / nối lại thì `quiz:question` của câu đó đã bay qua.
  const current = snapshot.data?.question;
  useEffect(() => {
    if (!sessionId || !current) return;
    useLiveQuizStore.getState().rememberQuestion(sessionId, current.index, {
      options: current.options.map((option) => option.text),
      prompt: current.prompt,
    });
  }, [current, sessionId]);

  useSocketEvent<QuizQuestionEvent>(SocketEvent.QUIZ_QUESTION, (payload) => {
    if (sessionId) {
      useLiveQuizStore.getState().rememberQuestion(sessionId, payload.index, {
        options: payload.options.map((option) => option.text),
        prompt: payload.prompt,
      });
    }
    patch((prev) => ({
      ...prev,
      answeredCount: 0,
      currentIndex: payload.index,
      phase: 'QUESTION',
      question: {
        deadlineAt: payload.deadlineAt,
        index: payload.index,
        options: payload.options,
        prompt: payload.prompt,
      },
      reveal: null,
      status: 'IN_PROGRESS',
      total: payload.total ?? prev.total,
      version: payload.version ?? prev.version,
    }));
  });

  // CHỈ host nhận. Bỏ qua gói của câu khác (đến muộn sau khi đã sang câu mới) — không cho số cũ đè số mới.
  useSocketEvent<QuizProgressEvent>(SocketEvent.QUIZ_PROGRESS, (payload) => {
    patch((prev) =>
      payload.index === prev.currentIndex
        ? {
            ...prev,
            answeredCount: payload.answeredCount,
            playersCount: payload.playersCount ?? prev.playersCount,
          }
        : prev,
    );
  });

  useSocketEvent<QuizRevealDto>(SocketEvent.QUIZ_REVEAL, (payload) => {
    if (sessionId) {
      useLiveQuizStore
        .getState()
        .rememberReveal(sessionId, payload.index, {
          correct: payload.correct,
          explanation: payload.explanation,
        });
    }
    patch((prev) => ({ ...prev, phase: 'REVEAL', reveal: payload }));
    // `quiz:reveal` không mang `version` — HOST tải lại để lệnh kế tiếp gửi đúng `expectedVersion`. ⛔ Người chơi không
    // tải lại: N máy cùng GET ngay lúc công bố là một đợt dồn tải vô ích (bảng điểm đã đến qua `quiz:leaderboard`).
    if (snapshot.data?.pin) void queryClient.invalidateQueries({ queryKey: key });
  });

  useSocketEvent<QuizLeaderboardEvent>(SocketEvent.QUIZ_LEADERBOARD, (payload) => {
    patch((prev) => ({
      ...prev,
      leaderboardTop: payload.top ?? prev.leaderboardTop,
      // ⚠️ `me` riêng của BE chỉ có `{ rank, score }` — gộp vào hàng cũ để giữ `userId` (xem `mergeMyScore`).
      me: mergeMyScore(prev.me, payload.me, myId),
    }));
  });

  useSocketEvent<QuizEndedEvent>(SocketEvent.QUIZ_ENDED, (payload) => {
    patch((prev) => ({
      ...prev,
      phase: 'ENDED',
      status: payload.status,
      version: payload.version ?? prev.version,
    }));
  });

  return { offsetMs, room, snapshot };
}
