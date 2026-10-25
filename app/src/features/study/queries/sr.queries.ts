import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { srService } from '../api/sr.service';
import type { SrReviewPayload } from '../api/sr.types';

/** Khoá React Query SR (app.md p4-02 §4). */
export const srKeys = {
  all: ['sr'] as const,
  due: (setId?: string) => ['sr', 'due', setId ?? 'all'] as const,
  summary: (setId?: string) => ['sr', 'summary', setId ?? 'all'] as const,
};

/**
 * Hàng đợi ôn hôm nay — chụp MỘT lần cho cả phiên (không tự refetch giữa chừng làm nhảy thẻ).
 *
 * ⚠️ `gcTime: 0`: ảnh chụp chỉ sống TRONG một phiên. Để mặc định (5 phút) + `staleTime: Infinity` thì rời màn rồi mở lại "Ôn
 * theo lịch" trong 5 phút là phát lại ĐÚNG những thẻ vừa chấm (không có lượt tải nào) — trong khi số trên Trang chủ đã về 0.
 */
export function useSrDue(setId?: string) {
  return useQuery({
    gcTime: 0,
    queryFn: () => srService.due(setId),
    queryKey: srKeys.due(setId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useSrSummary(setId?: string, enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => srService.summary(setId),
    queryKey: srKeys.summary(setId),
  });
}

/** Số lần gửi lại tối đa của một lượt chấm khi mất mạng/5xx (app.md p4-02 §4 "Ôn"). */
export const SR_REVIEW_MAX_RETRIES = 3;

/** Chỉ thử lại lỗi MẠNG (không có response) và 5xx — 4xx (`SR_001/003`, 404…) là câu trả lời dứt khoát, gửi lại vô ích. */
export function shouldRetryReview(failureCount: number, error: unknown): boolean {
  if (failureCount >= SR_REVIEW_MAX_RETRIES || !isAxiosError(error)) return false;
  return !error.response || error.response.status >= 500;
}

/** Chờ luỹ thừa 2: 1 s, 2 s, 4 s, trần 8 s. */
export function reviewRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 8000);
}

/**
 * Chấm một thẻ; KHÔNG làm mới `due` giữa phiên — chỉ `summary` (số đếm) được đánh dấu cũ.
 *
 * ✅ Hàng đợi gửi lại nằm ở mutation cache (app.md p4-02 §5): `networkMode: 'offlineFirst'` + `retry` theo backoff. Biến
 * `payload` (kèm `clientReviewId` sinh MỘT lần lúc bấm) được giữ nguyên qua các lần thử, nên BE idempotent — gửi lại
 * không ghi hai lần. Mất khi tắt app là chấp nhận: server chưa ghi thì thẻ vẫn còn đến hạn.
 */
export function useSrReview(onError?: (error: unknown) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SrReviewPayload) => srService.review(payload),
    networkMode: 'offlineFirst',
    // Cấp HOOK (không phải cấp `mutate`): chấm nhiều thẻ liền nhau, callback của `mutate()` chỉ chạy cho lần gọi CUỐI.
    onError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sr', 'summary'] }),
    retry: shouldRetryReview,
    retryDelay: reviewRetryDelay,
  });
}

export function useSrEnroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => srService.enroll(setId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: srKeys.all }),
  });
}

/** "Ngừng ôn bộ này" (`DELETE /sr/enrollments/:setId`) — lỗi đã toast ở interceptor chung. */
export function useSrUnenroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => srService.unenroll(setId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: srKeys.all }),
  });
}
