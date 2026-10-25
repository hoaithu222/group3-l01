import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { errorCodeOf } from '../utils/report-errors';
import { PORTFOLIO_NOT_TAKEN_DOWN_CODE } from './portfolio-moderation.api';
import { portfolioModerationService } from './portfolio-moderation.service';
import { refreshModeration } from './moderation.queries';

/** Cùng gốc `['moderation']` với `moderationKeys` (p6-07). */
export const portfolioModerationKeys = {
  detail: (portfolioId: string) => ['moderation', 'portfolio', portfolioId] as const,
};

/** Làm mới hồ sơ + hàng đợi/chi tiết báo cáo + nhật ký (gỡ trang cũng đóng báo cáo mở của nó). */
function refreshAfterDecision(qc: QueryClient, portfolioId: string): void {
  void qc.invalidateQueries({ queryKey: portfolioModerationKeys.detail(portfolioId) });
  refreshModeration(qc);
}

/** Hồ sơ bị báo cáo. `enabled` để tắt khi đích báo cáo không phải `PORTFOLIO`. */
export const useAdminPortfolio = (portfolioId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: portfolioModerationKeys.detail(portfolioId ?? ''),
    queryFn: () => portfolioModerationService.detail(portfolioId as string),
    select: (res) => res.data,
    enabled: enabled && !!portfolioId,
    // 404 (không còn) không tự khỏi khi gọi lại — vẽ trạng thái ngay.
    retry: false,
  });

/** `POST /admin/portfolios/:id/takedown` (`moderation:update`) — audit `portfolio.takedown`; đóng luôn báo cáo mở của hồ sơ. */
export const useTakedownPortfolio = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioModerationService.takedown,
    onSuccess: (_res, { portfolioId }) => {
      refreshAfterDecision(qc, portfolioId);
      showToast('success', 'Đã gỡ portfolio, thông báo cho chủ hồ sơ và ghi nhật ký');
    },
  });
};

/**
 * `POST /admin/portfolios/:id/restore` (`moderation:update`) — audit `portfolio.restore`. `PORT_012` (đã có người mở lại) không phải lỗi
 * đáng để hộp thoại kẹt: làm mới để khối chuyển sang trạng thái đúng.
 */
export const useRestorePortfolio = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioModerationService.restore,
    onSuccess: (_res, { portfolioId }) => {
      refreshAfterDecision(qc, portfolioId);
      showToast('success', 'Đã mở lại portfolio và ghi nhật ký — chủ hồ sơ tự bấm Công khai để đăng lại');
    },
    onError: (err, { portfolioId }) => {
      if (errorCodeOf(err) === PORTFOLIO_NOT_TAKEN_DOWN_CODE) refreshAfterDecision(qc, portfolioId);
    },
  });
};
