/** Phân hệ Dashboard (`HomePage`) — barrel export. */
export { default as DashboardBoard } from './components/DashboardBoard';
export { default as DashboardToolbar } from './components/DashboardToolbar';
export { default as OverviewKpiStrip } from './components/OverviewKpiStrip';
export { default as MentorReportsTodo } from './components/MentorReportsTodo';
export { OVERVIEW_KEY, useOverview } from './service/overview.queries';
export { INSIGHTS_KEY, insightsKey } from './service/insights.keys';
export { useInsights } from './service/insights.queries';
export { useInsightsRange } from './hooks/useInsightsRange';
export { DASHBOARD_CHART_COLORS } from './constants/dashboard.constants';
export { INSIGHT_SERIES_COLORS } from './constants/insights.constants';
