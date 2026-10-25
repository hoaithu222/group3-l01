/**
 * Public API của feature `moderation` — CHỈ phần nhẹ dùng lại được (bảng hàng đợi, bộ lọc, hook
 * lọc/realtime, query, kiểu), KHÔNG re-export trang: trang do registry nạp lười
 * (`moderation.routes.tsx`). Người dùng bên ngoài hiện là tab `reports` của workspace
 * (`features/workspace/components/tabs/WorkspaceReportsTab.tsx`) và tab "Học tập" của ngăn kéo người dùng (`UserStudyTab`, p4-01) — widget
 * nghiệp vụ dùng lại có chủ đích (admin.md p1-08 §3), cùng kiểu `user` → `audit-log`.
 */
export { default as ReportFilters } from './components/ReportFilters';
export { default as ReportQueueTable } from './components/ReportQueueTable';
export { default as UserStudyTab } from './components/UserStudyTab';
export { STUDY_FEATURE_FLAG } from './constants/study-set-moderation.constants';
export { useModerationOpenCount, useModerationSocket, useReportFilters } from './hooks';
export { moderationKeys, useAdminReports } from './service/moderation.queries';
export type {
  AdminReportAction,
  AdminReportGroup,
  AdminReportListParams,
  ReportStatus,
  ReportTargetType,
} from './types/moderation.types';
