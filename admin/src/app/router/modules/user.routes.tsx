import type { ModuleConfig } from './types';

/**
 * Người dùng — phân hệ nghiệp vụ THẬT đầu tiên của admin (Phase 0).
 *
 * Danh sách + drawer chi tiết (đổi vai trò, khoá/mở, phiên đăng nhập) — xem
 * `src/features/user/`.
 */
export const userModule: ModuleConfig = {
  id: 'user',
  path: '/user',
  title: 'Người dùng',
  subtitle: 'Tài khoản, vai trò hệ thống, phiên đăng nhập',
  iconName: 'user-outline',
  color: 'blue',
  order: 10,
  page: { lazy: () => import('@/features/user/pages/UserListPage') },
  routes: [
    {
      path: ':id',
      title: 'Chi tiết người dùng',
      lazy: () => import('@/features/user/pages/UserDetailPage'),
      hideInMenu: true,
    },
  ],
};
