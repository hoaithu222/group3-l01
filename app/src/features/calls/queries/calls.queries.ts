import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { callKeys } from '../api/calls.keys';
import { callsService } from '../api/calls.service';
import type { CallHistoryFilter, CallScopeType } from '../api/calls.types';

/**
 * `GET /me/active-call` — NGUỒN SỰ THẬT để hồi phục store khi app mở lại/socket nối lại (app.md p2-01 §4.1).
 * `staleTime: 0` + `refetchOnMount: 'always'`: luôn hỏi BE, không tin cache cũ (cuộc gọi có thể đã kết thúc khi app tắt).
 */
export function useMyActiveCall(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => callsService.getMyActive(),
    queryKey: callKeys.myActive,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

/** `GET /calls/:id` — chi tiết + `myActions`. */
export function useCall(callId: string | null | undefined) {
  return useQuery({
    enabled: Boolean(callId),
    queryFn: () => callsService.get(callId ?? ''),
    queryKey: callKeys.detail(callId ?? ''),
    staleTime: 0,
  });
}

/**
 * Banner "Đang có cuộc gọi — Tham gia" của một hội thoại/kênh. Cập nhật bằng socket (`useCallSignals` ghi thẳng
 * vào khoá này qua `setQueryData`), nên `staleTime` chỉ là lưới an toàn khi socket rơi.
 */
export function useActiveCallInScope(
  scopeType: CallScopeType,
  scopeId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(scopeId),
    queryFn: () => callsService.getActive(scopeType, scopeId ?? ''),
    queryKey: callKeys.active(scopeType, scopeId ?? ''),
    staleTime: 15_000,
  });
}

/** `GET /me/calls` — cursor `(callStartedAt, id)`; `missed` = MISSED + BUSY (BE). */
export function useCallHistory(filter: CallHistoryFilter) {
  return useInfiniteQuery({
    queryKey: callKeys.history(filter),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      callsService.history(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });
}
