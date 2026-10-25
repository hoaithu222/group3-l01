import { memo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import type { AdminInsights, AdminOverview } from '@/core/api/admin';
import { CompactKpiCard, Text } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import { NO_DATA } from '../constants/dashboard.constants';
import { INSIGHT_KPI_SPECS } from '../constants/insights.constants';
import { useModerationQueueHref } from '../hooks/useModerationQueueHref';
import InsightKpiCard from './InsightKpiCard';

export interface InsightKpiStripProps {
  overview: AdminOverview | undefined;
  insights: AdminInsights | undefined;
  /** `GET /admin/overview` đang tải lần đầu — tắt hiệu ứng đếm số của 3 thẻ tức thời. */
  overviewLoading: boolean;
  /** `GET /admin/overview/insights` đang tải lần đầu. */
  insightsLoading: boolean;
  /** Vừa đổi khoảng thời gian — 5 thẻ theo kỳ còn số cũ, làm mờ (3 thẻ tức thời không phụ thuộc kỳ nên KHÔNG mờ). */
  insightsStale: boolean;
}

/** Cột ở `md` trở lên theo số thẻ: ≤4 → mỗi thẻ một cột; 5–6 → 3 cột; 7–8 → 4 cột. Class LITERAL để Tailwind quét được. */
const COLS_CLASS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

/** Hàng cuối thiếu đúng một ô (5 thẻ/3 cột, 7 thẻ/4 cột) ⇒ thẻ cuối dãn 2 cột cho khỏi để hở một ô trống. */
const LAST_SPAN_CLASS = 'md:[&>:last-child]:col-span-2';

/** Ô chân của thẻ số tức thời — cao bằng dải sparkline để số của mọi thẻ nằm cùng một hàng ngang. (Hàm trả JSX, không phải component.) */
const snapshotFooter = (children: ReactNode) => (
  <div className="flex h-7 items-center">
    <Text ellipsis size="tiny" skin="muted">
      {children}
    </Text>
  </div>
);

/**
 * Dải KPI của trang Tổng quan: 5 thẻ có SO SÁNH KỲ TRƯỚC + sparkline (`InsightKpiCard`, theo khoảng thời gian đang chọn) và 3 thẻ SỐ TỨC THỜI
 * (báo cáo chờ xử lý, workspace hoạt động, người dùng trực tuyến — lấy từ `GET /admin/overview`, không theo kỳ nên không có ▲▼).
 *
 * Ẩn thẻ khi phân hệ tắt: cờ `useFeature` tắt (`false`) HOẶC BE không trả trường (`insights.kpis.messages` vắng). Cờ chưa biết (`undefined`, đang tải
 * `/capabilities`) coi như bật để thẻ không nhảy chỗ — ẩn muộn còn hơn hiện muộn.
 *
 * Số chưa có (đang tải) ⇒ `—`, KHÔNG phải 0. Dải này KHÔNG tự lo lỗi tải: `DashboardBoard` thay bằng `OverviewKpiStrip` khi insights lỗi.
 */
const InsightKpiStrip = memo(function InsightKpiStrip({
  overview,
  insights,
  overviewLoading,
  insightsLoading,
  insightsStale,
}: InsightKpiStripProps) {
  const communication = useFeature('communication');
  const voice = useFeature('voice');
  const meeting = useFeature('meeting');
  const gamification = useFeature('gamification');
  const moderationHref = useModerationQueueHref();

  const flags: Record<string, boolean | undefined> = { communication, voice, meeting, gamification };
  const specs = INSIGHT_KPI_SPECS.filter(
    (spec) =>
      (spec.flags.length === 0 || spec.flags.some((f) => flags[f] !== false)) &&
      (!insights || insights.kpis[spec.kpi] !== undefined),
  );
  const showWorkspaceReports = communication !== false;

  const count = specs.length + (showWorkspaceReports ? 2 : 0) + 1;
  const cols = count <= 4 ? count : count <= 6 ? 3 : 4;

  return (
    <div
      className={cn(
        'grid shrink-0 grid-cols-2 gap-2',
        COLS_CLASS[cols],
        cols > 2 && count % cols === cols - 1 && LAST_SPAN_CLASS,
      )}
    >
      {specs.map((spec) => (
        <InsightKpiCard
          key={spec.id}
          loading={insightsLoading}
          metric={insights?.kpis[spec.kpi]}
          series={insights?.series[spec.series]}
          spec={spec}
          stale={insightsStale}
        />
      ))}
      {showWorkspaceReports && (
        <CompactKpiCard
          animate={!overviewLoading}
          color="yellow"
          footer={
            overview && overview.openReports > 0 && moderationHref ? (
              <div className="flex h-7 items-center">
                <Link className="text-caption-12 text-link hover:underline" to={moderationHref}>
                  Mở hàng đợi
                </Link>
              </div>
            ) : (
              snapshotFooter('Số hiện tại, không theo kỳ')
            )
          }
          icon="shield-check-bold"
          label="Báo cáo chờ xử lý"
          layout="stack"
          value={overview ? overview.openReports : NO_DATA}
        />
      )}
      {showWorkspaceReports && (
        <CompactKpiCard
          animate={!overviewLoading}
          color="green"
          footer={snapshotFooter('Số hiện tại, không theo kỳ')}
          icon="users-bold"
          label="Workspace hoạt động"
          layout="stack"
          value={overview ? overview.activeWorkspaces : NO_DATA}
        />
      )}
      <CompactKpiCard
        animate={!overviewLoading}
        color="green"
        footer={snapshotFooter('Cập nhật theo thời gian thực')}
        icon="user-check-bold"
        label="Người dùng trực tuyến"
        layout="stack"
        value={overview ? overview.realtime.onlineUsers : NO_DATA}
      />
    </div>
  );
});

export default InsightKpiStrip;
