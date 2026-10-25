import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mockAttemptsService } from '../api/mock-attempts.service';
import {
  isMockResult,
  type CreateAttemptPayload,
  type MockAnswerInput,
  type MockAttemptEventInput,
  type MockAttemptView,
} from '../api/mock-attempts.types';
import { useMockPlayerStore } from '../store/mock-player.store';
import { srKeys } from './sr.queries';

/** Khoá React Query thi thử (app.md p4-02 §4). */
export const mockKeys = {
  all: ['mock-attempts'] as const,
  detail: (id: string) => ['mock-attempts', 'detail', id] as const,
  bySet: (setId: string) => ['mock-attempts', 'by-set', setId] as const,
  mine: () => ['mock-attempts', 'mine'] as const,
};

export function useMockAttempt(attemptId: string | undefined) {
  return useQuery({
    enabled: Boolean(attemptId),
    queryFn: () => mockAttemptsService.get(attemptId as string),
    queryKey: mockKeys.detail(attemptId ?? ''),
    refetchOnWindowFocus: false,
  });
}

export function useCreateMockAttempt(setId: string) {
  return useMutation({
    mutationFn: (vars: { payload: CreateAttemptPayload; idempotencyKey: string }) =>
      mockAttemptsService.create(setId, vars.payload, vars.idempotencyKey),
  });
}

/**
 * Lưu đáp án rồi gộp vào `myAnswers` của cache `detail` — mở lại màn thi (cache còn mới) vẫn thấy
 * lựa chọn vừa lưu, không phải chờ tải lại.
 */
export function useSaveMockAnswers(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: MockAnswerInput[]) => mockAttemptsService.putAnswers(attemptId, answers),
    onSuccess: (_res, answers) => {
      queryClient.setQueryData<MockAttemptView>(mockKeys.detail(attemptId), (old) => {
        if (!old || isMockResult(old)) return old;
        const saved = new Map(old.myAnswers.map((a) => [a.itemId, a]));
        for (const a of answers) {
          saved.set(a.itemId, {
            itemId: a.itemId,
            optionIds: a.optionIds ?? [],
            text: a.text ?? null,
          });
        }
        return { ...old, myAnswers: [...saved.values()] };
      });
    },
  });
}

/** Nộp bài → ghi kết quả vào cache `detail` để màn kết quả mở ngay không cần tải lại. */
export function useSubmitMockAttempt(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers?: MockAnswerInput[]) => mockAttemptsService.submit(attemptId, answers),
    onSuccess: (result) => {
      queryClient.setQueryData(mockKeys.detail(attemptId), result);
      void queryClient.invalidateQueries({ queryKey: srKeys.all });
      void queryClient.invalidateQueries({ queryKey: mockKeys.bySet(result.attempt.setId) });
      void queryClient.invalidateQueries({ queryKey: mockKeys.mine() });
      // Đáp án chờ gửi của lượt này hết nghĩa (đã chấm) — dọn NGAY ở cấp mutation, sống cả khi màn đã unmount.
      useMockPlayerStore.getState().clear(attemptId);
    },
  });
}

/** Sự kiện rời/vào app — chỉ thống kê, lỗi bỏ qua (không toast). */
export function useRecordMockEvent(attemptId: string) {
  return useMutation({
    mutationFn: (event: MockAttemptEventInput) => mockAttemptsService.recordEvent(attemptId, event),
  });
}

/**
 * Lịch sử thi (cursor): không `setId` ⇒ mọi bộ (`mockKeys.mine`), có ⇒ một bộ (`mockKeys.bySet`). Nộp bài làm cũ cả hai
 * khoá (`useSubmitMockAttempt`), nên quay lại màn lịch sử luôn thấy lượt mới.
 */
export function useMockHistory(setId?: string) {
  return useInfiniteQuery({
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      setId
        ? mockAttemptsService.listBySet(setId, pageParam)
        : mockAttemptsService.listMine(pageParam),
    queryKey: setId ? mockKeys.bySet(setId) : mockKeys.mine(),
  });
}
