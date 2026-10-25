import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { workspaceMediaStatsService } from './workspace-media-stats.service';

/** Cache 5 phút — khớp cache Redis phía BE (`statsCacheSeconds`), gọi lại sớm hơn chỉ nhận cùng kết quả. */
const STALE_MS = 5 * 60_000;

export const workspaceMediaStatsKeys = {
  all: ['workspace', 'media-stats'] as const,
  stats: (workspaceId: string, days: number) =>
    ['workspace', 'media-stats', workspaceId, days] as const,
};

/** Số liệu gọi & họp của một workspace trong `days` ngày. Đổi khoảng ngày giữ số cũ mờ đi thay vì nháy trắng (`keepPreviousData`); `retry: false` — lỗi thật không thử lại lặp. */
export const useWorkspaceMediaStats = (workspaceId: string, days: number) =>
  useQuery({
    queryKey: workspaceMediaStatsKeys.stats(workspaceId, days),
    queryFn: () => workspaceMediaStatsService.stats(workspaceId, days),
    select: (res) => res.data,
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: false,
  });
