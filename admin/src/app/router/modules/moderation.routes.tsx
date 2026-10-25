import type { ModuleConfig } from './types';

/**
 * Kiểm duyệt — hàng đợi báo cáo nền tảng (p1-08): báo cáo gộp theo đích, chi tiết, xem nội dung
 * riêng tư (D-06, có xác nhận + ghi nhật ký) và quyết định. Xem `src/features/moderation/`.
 *
 * Quyền vào: `moderation:view` (mặc định theo `id`); hành động `moderation:update`, xem nội dung
 * riêng tư `moderation:approve`, khoá tài khoản thêm `user:update` — các quyền đó do chính màn
 * hình kiểm. Cờ `communication` tắt → route trả trang "Chưa bật" (`FeatureGate`).
 *
 * `tabTitles`: `reports` (hàng đợi báo cáo) và `content` (p4-01: bộ học công khai bị báo cáo nhiều — trang chỉ hiện tab khi cờ
 * `study` bật); P1 thêm `users` — tài khoản bị báo nhiều, khi có trang thật.
 */
export const moderationModule: ModuleConfig = {
  id: 'moderation',
  path: '/moderation',
  title: 'Kiểm duyệt',
  subtitle: 'Báo cáo nội dung, người dùng, kênh và nhóm chat',
  iconName: 'shield-check-outline',
  color: 'orange',
  order: 30,
  featureFlag: 'communication',
  // Chấm số báo cáo chờ ở menu: chuỗi = khoá bộ đếm trực tiếp, giải ở `app/shell/useModuleBadges.ts`.
  badge: 'moderation-open',
  tabTitles: {
    reports: 'Báo cáo',
    content: 'Nội dung công khai',
  },
  defaultTab: 'reports',
  page: { lazy: () => import('@/features/moderation/pages/ModerationQueuePage') },
  routes: [
    {
      path: ':id',
      title: 'Chi tiết báo cáo',
      hideInMenu: true,
      lazy: () => import('@/features/moderation/pages/ReportDetailPage'),
    },
  ],
};
