import { memo, useMemo, type ReactNode } from 'react';

import { MODULE_BY_ID } from '@/app/router/modules/module-registry';
import { PanelCard } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { AdminInsights } from '@/core/api/admin';
import {
  BREAKDOWN_PANEL_ORDER,
  BREAKDOWN_PANELS,
  CALLS_PANEL_TITLES,
  REPORT_STATUS_LABELS,
  XL_COL_SPAN_CLASS,
  XP_SOURCE_LABELS,
  XP_SOURCE_LIMIT,
  type BreakdownPanelId,
} from '../constants/breakdown.constants';
import { layoutBreakdownPanels } from '../utils/breakdown-layout.utils';
import { colorOfReportStatus, hasPositiveCount, sumCounts } from '../utils/breakdown.utils';
import { peakCell } from '../utils/heatmap.utils';
import AccountsPanelBody from './AccountsPanelBody';
import ActivityHeatmap from './ActivityHeatmap';
import BreakdownBarChart from './BreakdownBarChart';
import BreakdownColumnChart from './BreakdownColumnChart';
import CallsPanelBody from './CallsPanelBody';
import TopWorkspacesPanel from './TopWorkspacesPanel';

export interface InsightsBreakdownGridProps {
  insights: AdminInsights | undefined;
  /** Đang tải LẦN ĐẦU (chưa có `insights`) → dựng khung đủ bộ với spinner; đã có dữ liệu thì refetch không nháy khung. */
  loading: boolean;
}

/** Một panel đã sẵn sàng dựng. `body` rỗng khi mới dựng khung chờ dữ liệu. */
interface PanelView {
  id: BreakdownPanelId;
  title: string;
  titleNote?: string;
  empty: boolean;
  body: ReactNode;
}

/**
 * Khối "Phân bổ & hoạt động" cuối trang Tổng quan — lưới panel biểu đồ phân bổ (tài khoản, hoạt động theo giờ, workspace sôi động, nguồn XP, cấp độ,
 * cuộc gọi & tin nhắn, báo cáo kiểm duyệt). Nguồn: `GET /admin/overview/insights` (`breakdowns`, `activityHeatmap`, `topWorkspaces`).
 *
 * ⛔ Trường vắng = cờ phân hệ tắt → panel đó KHÔNG được dựng (không ô trống, không số 0 giả). `layoutBreakdownPanels` xếp các panel còn lại vào lưới 12
 * cột sao cho mỗi hàng kín: đủ cờ → `[3·6·3]` + `[3·3·3·3]`; tắt `gamification` → `[4·8]` + `[4·4·4]`; chỉ còn vài panel → một hàng. Dưới `xl` lưới về
 * 2 cột (heatmap và panel hẹp lẻ cuối chiếm cả hàng) rồi 1 cột. Panel cao CỐ ĐỊNH `18rem` để các ô cùng hàng thẳng mép dưới và biểu đồ (`h-full`) đo được chiều cao.
 *
 * Mỗi panel một `tone` riêng (khác `sky` của biểu đồ hero). Panel có trường dữ liệu nhưng toàn 0 → trạng thái rỗng của `PanelCard`, không vẽ biểu đồ trơ.
 * Link tên workspace cần đường dẫn module từ registry — dựng ở đây (cùng tiền lệ `OverviewMediaKpis`/`DashboardBoard`) rồi truyền xuống `TopWorkspacesPanel`.
 */
const InsightsBreakdownGrid = memo(function InsightsBreakdownGrid({
  insights,
  loading,
}: InsightsBreakdownGridProps) {
  const workspaceBasePath = MODULE_BY_ID.workspace?.path ?? '/workspace';
  const placeholder = loading && !insights;

  const views = useMemo<PanelView[]>(() => {
    if (!insights) {
      return placeholder
        ? BREAKDOWN_PANEL_ORDER.map((id) => ({
            id,
            title: BREAKDOWN_PANELS[id].title,
            empty: false,
            body: null,
          }))
        : [];
    }
    const { breakdowns: b, activityHeatmap: heatmap, topWorkspaces } = insights;
    const { callMedia, messageScope, xpBySource, levelDistribution, reportStatus } = b;
    const callsTitle =
      callMedia && messageScope
        ? CALLS_PANEL_TITLES.both
        : callMedia
          ? CALLS_PANEL_TITLES.callsOnly
          : CALLS_PANEL_TITLES.messagesOnly;

    const candidates: (PanelView | undefined)[] = [
      {
        id: 'accounts',
        title: BREAKDOWN_PANELS.accounts.title,
        empty: !hasPositiveCount(b.userStatus),
        body: <AccountsPanelBody userRole={b.userRole} userStatus={b.userStatus} />,
      },
      heatmap && {
        id: 'heatmap',
        title: BREAKDOWN_PANELS.heatmap.title,
        titleNote: BREAKDOWN_PANELS.heatmap.titleNote,
        empty: peakCell(heatmap) === null,
        body: <ActivityHeatmap heatmap={heatmap} />,
      },
      topWorkspaces && {
        id: 'workspaces',
        title: BREAKDOWN_PANELS.workspaces.title,
        titleNote: BREAKDOWN_PANELS.workspaces.titleNote,
        empty: topWorkspaces.length === 0,
        body: <TopWorkspacesPanel workspaceBasePath={workspaceBasePath} workspaces={topWorkspaces} />,
      },
      xpBySource && {
        id: 'xp',
        title: BREAKDOWN_PANELS.xp.title,
        titleNote: `${formatNumber(sumCounts(xpBySource))} XP`,
        empty: !hasPositiveCount(xpBySource),
        body: (
          <BreakdownBarChart
            items={xpBySource}
            labels={XP_SOURCE_LABELS}
            limit={XP_SOURCE_LIMIT}
            unit="XP"
            valueName="Tổng XP"
          />
        ),
      },
      levelDistribution && {
        id: 'levels',
        title: BREAKDOWN_PANELS.levels.title,
        titleNote: BREAKDOWN_PANELS.levels.titleNote,
        empty: !hasPositiveCount(levelDistribution),
        body: (
          <BreakdownColumnChart
            categoryName="Cấp"
            items={levelDistribution}
            unit="người"
            valueName="Số người"
          />
        ),
      },
      (callMedia || messageScope) && {
        id: 'calls',
        title: callsTitle,
        empty: !hasPositiveCount(callMedia) && !hasPositiveCount(messageScope),
        body: <CallsPanelBody callMedia={callMedia} messageScope={messageScope} />,
      },
      reportStatus && {
        id: 'reports',
        title: BREAKDOWN_PANELS.reports.title,
        titleNote: `${formatNumber(sumCounts(reportStatus))} báo cáo`,
        empty: !hasPositiveCount(reportStatus),
        body: (
          <BreakdownBarChart
            colorOf={colorOfReportStatus}
            items={reportStatus}
            labels={REPORT_STATUS_LABELS}
            unit="báo cáo"
            valueName="Số báo cáo"
          />
        ),
      },
    ];
    return candidates.filter((view): view is PanelView => Boolean(view));
  }, [insights, placeholder, workspaceBasePath]);

  const placements = useMemo(() => layoutBreakdownPanels(views.map((v) => v.id)), [views]);
  if (views.length === 0) return null;

  return (
    <div className="grid auto-rows-[18rem] grid-flow-dense grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-12">
      {placements.map((placement, i) => {
        const view = views[i];
        const meta = BREAKDOWN_PANELS[view.id];
        return (
          <PanelCard
            key={view.id}
            className={cn(XL_COL_SPAN_CLASS[placement.xlSpan], placement.mdFull && 'md:col-span-2')}
            empty={view.empty}
            emptyText={meta.emptyText}
            frame="default"
            loading={placeholder}
            title={view.title}
            titleNote={view.titleNote}
            tone={meta.tone}
          >
            {view.body}
          </PanelCard>
        );
      })}
    </div>
  );
});

export default InsightsBreakdownGrid;
