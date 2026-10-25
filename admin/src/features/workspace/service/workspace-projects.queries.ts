import { useQuery } from '@tanstack/react-query';

import { CONTRIBUTION_STATS_DAYS } from '../constants/workspace-projects.constants';
import { workspaceProjectsService } from './workspace-projects.service';

/**
 * Key theo admin.md p3-02 §3: `['workspace', 'project-stats', id]`; p4-06 admin.md §3:
 * `['workspace', 'contribution-stats', id, days]`.
 */
export const workspaceProjectsKeys = {
  stats: (workspaceId: string) => ['workspace', 'project-stats', workspaceId] as const,
  contributionStats: (workspaceId: string, days: number) =>
    ['workspace', 'contribution-stats', workspaceId, days] as const,
};

/** Cache 60 giây (admin.md p3-02 §3) — số liệu tổng hợp, không cần tươi từng giây. */
const PROJECT_STATS_STALE_MS = 60_000;

/** Chỉ mount khi cờ `project` bật (xem `WorkspaceDetailPage`); dữ liệu chỉ là số đếm + tên bảng. */
export const useWorkspaceProjectStats = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: workspaceProjectsKeys.stats(workspaceId ?? ''),
    queryFn: () => workspaceProjectsService.stats(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: PROJECT_STATS_STALE_MS,
  });

/**
 * Số đếm sức khoẻ báo cáo đóng góp của nhóm (khối trong tab "Dự án"). Cache 60 giây như `useWorkspaceProjectStats`;
 * chỉ gọi khi tab dự án đang mở nên tự tôn trọng cờ `project` (tắt → 404 `CFG_005`, khối tự ẩn).
 */
export const useWorkspaceContributionStats = (
  workspaceId: string | undefined,
  days: number = CONTRIBUTION_STATS_DAYS,
) =>
  useQuery({
    queryKey: workspaceProjectsKeys.contributionStats(workspaceId ?? '', days),
    queryFn: () => workspaceProjectsService.contributionStats(workspaceId as string, days),
    enabled: !!workspaceId,
    staleTime: PROJECT_STATS_STALE_MS,
  });
