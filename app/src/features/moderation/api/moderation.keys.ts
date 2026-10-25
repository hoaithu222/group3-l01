import type { QueueScope, ReportStatus } from './moderation.types';

/** Khoá query của `moderation` (app.md p1-08 §4) — đưa MỌI tham số ảnh hưởng kết quả vào khoá. */
export const moderationKeys = {
  blocks: ['blocks'] as const,
  myReports: ['reports', 'mine'] as const,
  /** Tiền tố của MỌI trạng thái trong một phạm vi — `invalidateQueries` sau khi xử lý xong. */
  scopeReportsAll: (scope: QueueScope) => ['reports', 'scope', scope.type, scope.id] as const,
  scopeReports: (scope: QueueScope, status: ReportStatus) =>
    ['reports', 'scope', scope.type, scope.id, status] as const,
  report: (reportId: string) => ['reports', 'detail', reportId] as const,
};
