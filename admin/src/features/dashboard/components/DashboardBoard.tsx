import { memo } from 'react';

import type { AdminInsights, AdminOverview } from '@/core/api/admin';
import { Button, Callout } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import DashboardHero from './DashboardHero';
import InsightKpiStrip from './InsightKpiStrip';
import InsightsBreakdownGrid from './InsightsBreakdownGrid';
import MentorReportsTodo from './MentorReportsTodo';
import OverviewKpiStrip from './OverviewKpiStrip';
import SmartHighlights from './SmartHighlights';

export interface DashboardBoardProps {
  overview: AdminOverview | undefined;
  insights: AdminInsights | undefined;
  /** `GET /admin/overview` đang tải lần đầu. */
  overviewLoading: boolean;
  /** `GET /admin/overview/insights` đang tải lần đầu (chưa có số nào). */
  insightsLoading: boolean;
  /** Vừa đổi khoảng thời gian — hình cũ còn đó, chờ số mới. */
  insightsStale: boolean;
  /** Tải insights LỖI và chưa có số nào để giữ lại. */
  insightsFailed: boolean;
  onRetryInsights: () => void;
}

/**
 * Thân trang Tổng quan, xếp từ trên xuống (cha là `PageBody` cuộn dọc, khe `gap-2`):
 *
 *   dải KPI → "Điều đáng chú ý" → [việc cần làm] → HERO (xu hướng | Gọi & họp) → lưới phân bổ
 *
 * Hai nguồn số liệu độc lập (`overview` và `insights`), phần nào lỗi thì chỉ phần đó rơi về trạng thái lỗi:
 *  - insights LỖI mà đã có `overview` ⇒ cảnh báo nhỏ + "Thử lại"; dải KPI quay về `OverviewKpiStrip` (số của `overview`) để trang vẫn có KPI.
 *  - cả hai lỗi ⇒ cha (`HomePage`) đã hiện MỘT banner lỗi chung; ở đây không thêm banner thứ hai (hai nút "Thử lại" là rối).
 */
const DashboardBoard = memo(function DashboardBoard({
  overview,
  insights,
  overviewLoading,
  insightsLoading,
  insightsStale,
  insightsFailed,
  onRetryInsights,
}: DashboardBoardProps) {
  return (
    <>
      {insightsFailed && overview && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={onRetryInsights}>
              Thử lại
            </Button>
          }
          className="shrink-0"
          description="Biểu đồ xu hướng và so sánh với kỳ trước tạm thời chưa có — các số liệu còn lại vẫn hiển thị."
          intent="warning"
          title="Không tải được số liệu phân tích"
        />
      )}
      {insightsFailed ? (
        <OverviewKpiStrip data={overview} loading={overviewLoading} />
      ) : (
        <InsightKpiStrip
          insights={insights}
          insightsLoading={insightsLoading}
          insightsStale={insightsStale}
          overview={overview}
          overviewLoading={overviewLoading}
        />
      )}
      <SmartHighlights insights={insights} overview={overview} />
      <MentorReportsTodo />
      <DashboardHero
        insights={insights}
        insightsLoading={insightsLoading}
        insightsStale={insightsStale}
        media={overview?.media}
        mediaLoading={overviewLoading}
      />
      {/* `shrink-0`: con của vùng cuộn flex-column mặc định co được — khối này phải giữ nguyên chiều cao tự nhiên, cuộn thay vì bị ép bẹp. */}
      <div className={cn('shrink-0 transition-opacity', insightsStale && 'opacity-60')}>
        <InsightsBreakdownGrid insights={insights} loading={insightsLoading} />
      </div>
    </>
  );
});

export default DashboardBoard;
