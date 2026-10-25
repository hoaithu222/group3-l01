import type { ModuleConfig } from './types';

/**
 * Tích hợp (p5-03) — sự kiện webhook GitHub/GitLab/Figma/Google (payload đã che, phát lại), bật/tắt nhà cung cấp, kết nối lỗi. Xem
 * `src/features/integration/`. Quyền vào `integration:view` (mặc định theo `id`); ghi (phát lại, bật/tắt) `integration:update` do màn hình kiểm.
 *
 * Thêm tab `collab` (p6-01: vận hành dịch vụ soạn thảo cộng tác, `src/features/collab-ops/`) — theo cờ `collab` riêng, nên `featureFlag` là MẢNG:
 * phân hệ hiện/vào được khi BẤT KỲ cờ `integration` hoặc `collab` bật; từng tab tự kiểm cờ của mình (`IntegrationPage`). Cả hai cờ tắt → trang "Chưa bật".
 */
export const integrationModule: ModuleConfig = {
  id: 'integration',
  path: '/integration',
  title: 'Tích hợp',
  subtitle: 'Webhook, nhà cung cấp, kết nối lỗi, soạn thảo cộng tác',
  iconName: 'link-outline',
  color: 'azure',
  order: 80,
  featureFlag: ['integration', 'collab'],
  tabTitles: {
    events: 'Sự kiện webhook',
    providers: 'Nhà cung cấp',
    connections: 'Kết nối lỗi',
    collab: 'Soạn thảo cộng tác',
  },
  defaultTab: 'events',
  page: { lazy: () => import('@/features/integration/pages/IntegrationPage') },
  routes: [
    {
      // Deep link tới ngăn kéo sự kiện — chuyển về `/integration?tab=events&eventId=` (giữ danh sách phía sau).
      path: 'events/:id',
      title: 'Chi tiết sự kiện webhook',
      hideInMenu: true,
      lazy: () => import('@/features/integration/pages/WebhookEventRedirectPage'),
    },
  ],
};
