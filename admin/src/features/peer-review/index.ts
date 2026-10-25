/**
 * Public API của phân hệ `peer-review` (chấm chéo, p4-05) cho code NGOÀI phân hệ (cùng mẫu `@/features/audit-log`):
 * khối số liệu chấm chéo của một nhóm, để tab "Dự án" của workspace nhúng vào. Thẻ cấu hình mặc định nằm ở
 * `features/system-config/pm` (tab "Dự án" của cấu hình hệ thống).
 */
export { default as WorkspaceReviewStats } from './components/WorkspaceReviewStats';
export { peerReviewKeys, useWorkspaceReviewStats } from './service/peer-review.queries';
export type { ReviewBoardRow, ReviewStatsView } from './types/peer-review.types';
