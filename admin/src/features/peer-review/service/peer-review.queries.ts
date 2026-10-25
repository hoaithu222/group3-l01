import { useQuery } from '@tanstack/react-query';

import { REVIEW_STATS_DAYS, REVIEW_STATS_STALE_MS } from '../constants/peer-review.constants';
import { peerReviewService } from './peer-review.service';

/** Key theo admin.md p4-05 §3: `['workspace', 'review-stats', id, days]`. */
export const peerReviewKeys = {
  stats: (workspaceId: string, days: number) => ['workspace', 'review-stats', workspaceId, days] as const,
};

/**
 * Số đếm chấm chéo của nhóm (khối trong tab "Dự án"). Cache 60 giây; chỉ gọi khi khối được mount nên tự tôn trọng cờ
 * `project` (tắt → 404 `CFG_005`, khối tự ẩn).
 */
export const useWorkspaceReviewStats = (
  workspaceId: string | undefined,
  days: number = REVIEW_STATS_DAYS,
) =>
  useQuery({
    queryKey: peerReviewKeys.stats(workspaceId ?? '', days),
    queryFn: () => peerReviewService.stats(workspaceId as string, days),
    enabled: !!workspaceId,
    staleTime: REVIEW_STATS_STALE_MS,
  });
