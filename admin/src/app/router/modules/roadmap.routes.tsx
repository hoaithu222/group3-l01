import type { ModuleConfig } from './types';

/**
 * Lộ trình học (p4-07, cờ `roadmap`) — Subject → Phase (tháng) → Lesson (buổi); admin soạn markdown có
 * xem trước, quản lý tài liệu/ảnh, kéo thả sắp xếp, xuất bản/ẩn (`src/features/roadmap/`).
 *
 * ⚠️ admin.md §1 ghi `iconName: 'map'` nhưng registry icon (`src/shared/ui/icons/index.ts`) chỉ có biến
 * thể có hậu tố (`map-outline`/`map-bold`, khớp mọi module khác trong registry này) — `SystemIconName` là
 * `keyof typeof systemIcons` nên `'map'` trần không compile được. Dùng `'map-outline'`.
 */
export const roadmapModule: ModuleConfig = {
  id: 'roadmap',
  path: '/roadmap',
  title: 'Lộ trình học',
  iconName: 'map-outline',
  color: 'teal',
  order: 65,
  featureFlag: 'roadmap',
  page: { lazy: () => import('@/features/roadmap/pages/SubjectsPage') },
  routes: [
    {
      path: 'subjects/new',
      title: 'Tạo lộ trình',
      hideInMenu: true,
      permission: { resource: 'roadmap', action: 'create' },
      lazy: () => import('@/features/roadmap/pages/SubjectCreatePage'),
    },
    {
      path: 'subjects/:subjectId',
      title: 'Chi tiết lộ trình',
      hideInMenu: true,
      lazy: () => import('@/features/roadmap/pages/SubjectDetailPage'),
    },
    {
      path: 'lessons/:lessonId',
      title: 'Soạn buổi học',
      hideInMenu: true,
      lazy: () => import('@/features/roadmap/pages/LessonEditorPage'),
    },
  ],
};
