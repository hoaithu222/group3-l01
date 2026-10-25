import type { ModuleConfig } from './types';

/**
 * Kỹ năng xác thực (p6-06, cờ `career`) — danh mục kỹ năng + tiêu chí, xem trước người đủ điều kiện, bật/tắt, đánh giá lại
 * (`src/features/skill/`). Tab "Kỹ năng" trong ngăn kéo người dùng nằm ở `features/user`.
 */
export const skillModule: ModuleConfig = {
  id: 'skill',
  path: '/skill',
  title: 'Kỹ năng',
  subtitle: 'Huy hiệu kỹ năng xác thực từ task thật',
  iconName: 'shield-outline',
  color: 'emerald',
  order: 90,
  featureFlag: 'career',
  page: { lazy: () => import('@/features/skill/pages/SkillListPage') },
  routes: [
    {
      path: 'new',
      title: 'Tạo kỹ năng',
      hideInMenu: true,
      permission: { resource: 'skill', action: 'create' },
      lazy: () => import('@/features/skill/pages/SkillDetailPage'),
    },
    {
      path: ':id',
      title: 'Chi tiết kỹ năng',
      hideInMenu: true,
      lazy: () => import('@/features/skill/pages/SkillDetailPage'),
    },
  ],
};
