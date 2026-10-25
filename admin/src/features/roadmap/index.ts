/**
 * Public API của phân hệ `roadmap` (p4-07) cho code NGOÀI phân hệ — mẫu `@/features/audit-log`: CHỈ phần
 * nhẹ (query + kiểu), KHÔNG re-export trang/component (trang nạp lười qua `roadmap.routes.tsx`, tự import
 * component theo đường dẫn tương đối bên trong phân hệ).
 *
 * ⚠️ Hiện CHƯA có phân hệ nào khác import từ đây (P0: không có tab "Lộ trình" trong ngăn kéo người dùng,
 * không có widget dùng lại ở `workspace`/`gamification`…) — khác `gamification`/`skill`/`moderation` mà
 * mọi export ở barrel của họ đều có nơi dùng thật. Vẫn khai theo đúng file tree admin.md §3 để phân hệ có
 * điểm vào công khai sẵn cho lúc cần (README §3 P1: `roadmap.lesson-completed` → XP/streak có thể cần đọc
 * `roadmapAdminKeys`/kiểu từ đây); `npm run check:orphans` (knip) vì vậy sẽ báo file này chưa ai import —
 * KHÔNG nằm trong yêu cầu xác minh của lượt việc này (chỉ `typecheck`/`lint`), xem báo cáo bàn giao.
 */
export { roadmapAdminKeys, useAdminSubjects, useAdminSubject } from './service/roadmap.queries';
export { roadmapService } from './service/roadmap.service';
export type {
  AdminLessonDetail,
  AdminLessonSummary,
  AdminPhase,
  AdminSubjectDetail,
  AdminSubjectRow,
  RoadmapLessonLabel,
  RoadmapSubjectStatus,
} from './types/roadmap.types';
