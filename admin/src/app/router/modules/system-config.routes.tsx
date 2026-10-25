import type { ModuleConfig } from './types';

/**
 * Cấu hình hệ thống — giới hạn, tính năng, xác thực, lưu trữ, thông báo, media, job nền.
 *
 * `tabTitles` liệt kê MỌI tab dự kiến; trang chỉ hiện tab đã có component
 * trong `features/system-config/tabs/tab-registry.ts` (tab chưa làm bị ẩn).
 * `ai`/`economy` đã bỏ khỏi Phase 0 — thêm lại khi phân hệ có mã. `pm` (Dự án) thêm lại ở
 * Phase 3 (p3-02): tab chỉ mở khi cờ `project` bật (`featureFlag` ở tab-registry). `templates` (Mẫu nhóm, p5-04) luôn mở.
 */
export const systemConfigModule: ModuleConfig = {
  id: 'system-config',
  path: '/system-config',
  title: 'Cấu hình',
  subtitle: 'Giới hạn, tính năng, lưu trữ, thông báo, media, job nền',
  iconName: 'sliders-outline',
  color: 'sky',
  order: 50,
  tabTitles: {
    limits: 'Giới hạn',
    features: 'Tính năng',
    auth: 'Xác thực',
    templates: 'Mẫu nhóm',
    storage: 'Lưu trữ',
    notifications: 'Thông báo',
    media: 'Media',
    jobs: 'Job nền',
    pm: 'Dự án',
    plagiarism: 'Kiểm tra trùng lặp',
  },
  defaultTab: 'limits',
  page: { lazy: () => import('@/features/system-config/pages/SystemConfigPage') },
};
