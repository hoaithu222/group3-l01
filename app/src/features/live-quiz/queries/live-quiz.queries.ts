import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LiveQuizCommand } from '../api/live-quiz.api';
import { liveQuizKeys } from '../api/live-quiz.keys';
import { liveQuizService } from '../api/live-quiz.service';
import type { CreateLiveQuizPayload, JoinLiveQuizPayload, LiveQuizSnapshot } from '../api/live-quiz.types';
import { withClockOffset } from '../utils/clock';
import { quizErrorCode } from '../utils/quiz-errors';

/**
 * Snapshot phiên — `staleTime: 0`: nguồn sự thật là server, socket chỉ patch giữa hai lần tải.
 * ⚠️ Snapshot của BE KHÔNG có kết quả câu vừa đóng (`reveal` chỉ đến qua `quiz:reveal`) — tải lại giữa lúc công bố
 * phải GIỮ `reveal` cũ nếu vẫn cùng câu, không thì bảng đáp án biến mất ngay sau khi hiện.
 */
export function useLiveQuizSnapshot(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = liveQuizKeys.session(sessionId ?? '');
  return useQuery({
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<LiveQuizSnapshot> => {
      const next = withClockOffset(await liveQuizService.get(sessionId ?? ''));
      const prev = queryClient.getQueryData<LiveQuizSnapshot>(queryKey)?.reveal;
      const keep = next.phase === 'REVEAL' && prev?.index === next.currentIndex;
      return { ...next, reveal: keep ? prev : null };
    },
    queryKey,
    retry: false,
    staleTime: 0,
  });
}

export function useCreateLiveQuiz() {
  return useMutation({
    mutationFn: ({ idempotencyKey, payload }: { idempotencyKey: string; payload: CreateLiveQuizPayload }) =>
      liveQuizService.create(payload, idempotencyKey),
  });
}

export function useJoinLiveQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: JoinLiveQuizPayload) => liveQuizService.join(payload),
    onSuccess: (result) =>
      queryClient.setQueryData(liveQuizKeys.session(result.sessionId), withClockOffset(result.snapshot)),
  });
}

/** Lệnh host (CAS `expectedVersion`). Lệch version/sai trạng thái ⇒ tải lại snapshot để nút phản ánh đúng. */
export function useHostCommand(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ command, expectedVersion }: { command: LiveQuizCommand; expectedVersion: number }) =>
      liveQuizService.command(sessionId, command, expectedVersion),
    onSettled: () => queryClient.invalidateQueries({ queryKey: liveQuizKeys.session(sessionId) }),
  });
}

export function useKickPlayer(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => liveQuizService.kick(sessionId, userId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: liveQuizKeys.session(sessionId) }),
  });
}

/** Kết quả bền — `persisted=false` hoặc `QUIZ_008` (job `live-quiz.persist` chưa chạy) ⇒ tự thử lại mỗi 2 s. */
export function useLiveQuizResults(sessionId: string | undefined) {
  return useQuery({
    enabled: Boolean(sessionId),
    queryFn: () => liveQuizService.results(sessionId ?? ''),
    queryKey: liveQuizKeys.results(sessionId ?? ''),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && !data.persisted) return 2000;
      return quizErrorCode(query.state.error) === 'QUIZ_008' ? 2000 : false;
    },
    retry: (count, error) => quizErrorCode(error) === 'QUIZ_008' && count < 10,
    retryDelay: 2000,
  });
}

/** `enabled = false`: nơi chỉ CẦN khi có điều kiện (vd tra `setId` cho nút ôn tập) không gọi mạng vô ích. */
export function useLiveQuizHistory(enabled = true) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => liveQuizService.history(pageParam),
    queryKey: liveQuizKeys.history(),
    staleTime: 30_000,
  });
}
