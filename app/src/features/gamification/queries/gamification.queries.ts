import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useFeature } from '@/shell/capabilities';

import { gamificationService } from '../api/gamification.service';
import type { BadgeDto, LeaderboardPeriod, MyGamificationDto } from '../api/gamification.types';
import { applySeenLevel } from '../utils/gamification-events';
import { gamificationKeys } from './gamification.keys';

const XP_PAGE_SIZE = 20;

/** Chỉ gọi API khi cờ `gamification` BẬT (chưa tải capabilities = chưa gọi) — cờ tắt BE trả 404. */
function useGamificationEnabled(): boolean {
  return useFeature('gamification') === true;
}

/** Hồ sơ XP/cấp/chuỗi của tôi — staleTime 60 s (app.md §4). */
export function useMyGamification() {
  const enabled = useGamificationEnabled();
  return useQuery({
    enabled,
    queryFn: () => gamificationService.me(),
    queryKey: gamificationKeys.me(),
    staleTime: 60_000,
  });
}

/** Danh mục huy hiệu + tiến độ + thời điểm mở. */
export function useBadgeCatalog() {
  const enabled = useGamificationEnabled();
  return useQuery({
    enabled,
    queryFn: () => gamificationService.badges(),
    queryKey: gamificationKeys.badges(),
    staleTime: 60_000,
  });
}

/** Lịch sử XP (cursor, mới → cũ). `retry: false` để lỗi hiện ngay với "Thử lại". */
export function useXpEvents() {
  const enabled = useGamificationEnabled();
  return useInfiniteQuery({
    // ⚠️ `queryFn` trước `getNextPageParam`: TypeScript suy kiểu trang theo thứ tự khai báo.
    queryFn: ({ pageParam }) =>
      gamificationService.xpEvents({ cursor: pageParam, limit: XP_PAGE_SIZE }),
    queryKey: gamificationKeys.xpEvents(),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/** Bảng xếp hạng nhóm — staleTime 5 phút; 404 (khách/ngoài nhóm) không thử lại. */
export function useLeaderboard(wsId: string, period: LeaderboardPeriod) {
  const enabled = useGamificationEnabled() && Boolean(wsId);
  return useQuery({
    enabled,
    queryFn: () => gamificationService.leaderboard(wsId, period),
    queryKey: gamificationKeys.leaderboard(wsId, period),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/**
 * Lưu trưng bày (≤ 6 huy hiệu ĐÃ mở). Lạc quan trên `me.showcase`, rollback khi lỗi (app.md §4); nơi gọi toast lỗi
 * (`GAME_006`) — service đã `skipErrorToast`.
 */
export function useSetShowcase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (badgeIds: string[]) => gamificationService.setShowcase(badgeIds),
    onMutate: async (badgeIds) => {
      await queryClient.cancelQueries({ queryKey: gamificationKeys.me() });
      const previous = queryClient.getQueryData<MyGamificationDto>(gamificationKeys.me());
      const catalog = queryClient.getQueryData<BadgeDto[]>(gamificationKeys.badges());
      if (previous && catalog) {
        const byId = new Map(catalog.map((badge) => [badge.id, badge]));
        const showcase = badgeIds.flatMap((id) => {
          const badge = byId.get(id);
          return badge ? [badge] : [];
        });
        queryClient.setQueryData<MyGamificationDto>(gamificationKeys.me(), {
          ...previous,
          showcase,
        });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(gamificationKeys.me(), context.previous);
    },
    onSuccess: ({ showcase }) => {
      queryClient.setQueryData<MyGamificationDto>(gamificationKeys.me(), (current) =>
        current ? { ...current, showcase } : current,
      );
    },
  });
}

/** Đánh dấu đã xem huy hiệu mới (đồng bộ mọi thiết bị); lỗi bỏ qua — lần mở sau thử lại. */
export function useMarkBadgesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (badgeIds: string[]) => gamificationService.seen({ badgeIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.me() });
    },
  });
}

/**
 * Đánh dấu đã xem modal lên cấp (`seen { level }`, đồng bộ mọi thiết bị). Lỗi KHÔNG chặn (đã `skipErrorToast`): server
 * vẫn coi là chờ ⇒ lần mở app sau hiện lại (app.md §3). Thành công ⇒ cache làm cùng luật server (`applySeenLevel`).
 */
export function useMarkLevelSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (level: number) => gamificationService.seen({ level }),
    onSuccess: (_data, level) => {
      queryClient.setQueryData<MyGamificationDto>(gamificationKeys.me(), (current) =>
        current ? applySeenLevel(current, level) : current,
      );
    },
  });
}
