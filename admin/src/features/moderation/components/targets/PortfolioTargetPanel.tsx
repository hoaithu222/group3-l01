import { memo } from 'react';

import { BoxPanel, Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminPortfolio } from '../../service/portfolio-moderation.queries';
import type { AdminReportGroup } from '../../types/moderation.types';
import { isReportUnavailable } from '../../utils/report-errors';
import PortfolioReportContext from './PortfolioReportContext';
import PortfolioTakedownActions from './PortfolioTakedownActions';

export interface PortfolioTargetPanelProps {
  /** Nhóm báo cáo có `targetType = PORTFOLIO` — `targetId` là id hồ sơ. */
  group: AdminReportGroup;
  /** `moderation:update` — gỡ/mở lại. */
  canUpdate: boolean;
}

/**
 * Phần riêng của báo cáo `PORTFOLIO` trên trang chi tiết (p6-07): ngữ cảnh hồ sơ (chỉ metadata) → gỡ/mở lại. Hồ sơ không còn (404) hoặc
 * không được xem (403) → nói rõ lý do, KHÔNG có "Thử lại" (thử lại vẫn thế); mất mạng/5xx → Callout + "Thử lại".
 */
const PortfolioTargetPanel = memo(function PortfolioTargetPanel({
  group,
  canUpdate,
}: PortfolioTargetPanelProps) {
  const { data: portfolio, isLoading, isError, error, refetch } = useAdminPortfolio(group.targetId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (isError || !portfolio) {
    if (isReportUnavailable(error)) {
      return (
        <BoxPanel border="hairline" title="Portfolio bị báo cáo">
          <EmptyState
            description="Hồ sơ không còn tồn tại hoặc bạn không có quyền xem, nên không còn thuộc phạm vi kiểm duyệt."
            size="sm"
            title="Portfolio không còn khả dụng"
          />
        </BoxPanel>
      );
    }
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được portfolio"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PortfolioReportContext group={group} portfolio={portfolio} />
      <PortfolioTakedownActions canUpdate={canUpdate} group={group} portfolio={portfolio} />
    </div>
  );
});

export default PortfolioTargetPanel;
