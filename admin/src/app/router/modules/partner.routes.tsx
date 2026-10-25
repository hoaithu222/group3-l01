import type { ModuleConfig } from './types';

/**
 * Cổng chủ tiệm in (p6-05, cờ `o2o`) — TỰ PHỤC VỤ cho vai `partner`: hàng đợi đơn (nhận/từ chối/in/giao bằng PIN), bảng giá chỉ đọc, tài khoản
 * (`src/features/partner/`). `audience: 'partner'` — chỉ tài khoản có `partner:view` thấy module này (và thấy MỖI module này). `partner:view/update`
 * là quyền THEO DỮ LIỆU do BE cấp cho chủ tiệm ĐÃ DUYỆT (không thuộc vai hệ thống), nên tiệm bị tạm ngưng mất quyền → `PermissionGuard` đẩy ra `/403`.
 */
export const partnerModule: ModuleConfig = {
  id: 'partner',
  path: '/partner',
  title: 'Tiệm in',
  iconName: 'printer-bold',
  color: 'orange',
  order: 10,
  audience: 'partner',
  featureFlag: 'o2o',
  tabTitles: {
    queue: 'Đơn hàng',
    prices: 'Bảng giá',
    account: 'Tài khoản',
  },
  defaultTab: 'queue',
  page: { lazy: () => import('@/features/partner/pages/PartnerPage') },
  routes: [
    {
      path: 'orders/:id',
      title: 'Chi tiết đơn',
      hideInMenu: true,
      lazy: () => import('@/features/partner/pages/PartnerOrderPage'),
    },
  ],
};
