import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroStore } from '../store/pomodoro.store';
import { clockOffset } from '../utils/clock';
import { mergeSnapshot } from '../utils/snapshot';

/**
 * Snapshot của kênh — `staleTime: 0`: nguồn sự thật là server, socket `pomodoro:updated` chỉ patch giữa hai lần tải.
 * Đo lệch đồng hồ NGAY lúc nhận (`clockOffset` trong `queryFn`) — đo muộn hơn là cộng thêm độ trễ render; và gộp với bản đang giữ
 * (`mergeSnapshot`) để một lượt REST chậm hơn socket không ghi đè bản mới.
 */
export function usePomodoroSnapshotQuery(channelId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  return useQuery({
    enabled,
    queryFn: async (): Promise<PomodoroSnapshot> => {
      const next = await pomodoroService.getSnapshot(channelId);
      usePomodoroStore.getState().pushOffset(channelId, clockOffset(next.serverNow));
      return mergeSnapshot(queryClient.getQueryData<PomodoroSnapshot>(pomodoroKeys.snapshot(channelId)), next, myId);
    },
    queryKey: pomodoroKeys.snapshot(channelId),
    retry: false,
    staleTime: 0,
  });
}

/** Kết quả phiên (bottom sheet cuối phiên) — chỉ tải khi phiên đã ENDED. */
export function usePomodoroResult(channelId: string, sessionId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && sessionId !== null,
    queryFn: () => pomodoroService.sessionResult(channelId, sessionId ?? ''),
    queryKey: pomodoroKeys.result(channelId, sessionId ?? ''),
    retry: 1,
    staleTime: 60_000,
  });
}

/** Lịch sử phiên của tôi (`GET /me/pomodoro/history`, cursor, mới → cũ). */
export function usePomodoroHistory(enabled = true) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => pomodoroService.history(pageParam),
    queryKey: pomodoroKeys.history(),
    staleTime: 30_000,
  });
}
