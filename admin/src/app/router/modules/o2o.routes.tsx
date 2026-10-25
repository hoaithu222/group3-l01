import type { ModuleConfig } from './types';

/**
 * Địa điểm & in ấn (p6-05, cờ `o2o`) — VẬN HÀNH mạng lưới địa điểm · tiệm in · đơn in (`src/features/o2o/`). Quyền vào `o2o:view` (mặc định theo
 * `id`); tạo `o2o:create`, sửa/ẩn/huỷ đơn `o2o:update`, duyệt tiệm `o2o:approve` — kiểm ở từng tab/ngăn kéo. Audience `ops` (mặc định): chủ tiệm chỉ
 * thấy module `partner`. Chi tiết mở bằng ngăn kéo trên nền danh sách (`?locationId=|shopId=|orderId=`); deep link `/o2o/:tab/:id` chuyển về đó.
 * Chọn điểm trên bản đồ chưa có (chờ `mapbox-gl`) — form địa điểm nhập toạ độ tay, điểm nối ở `components/locations/CoordinateFields.tsx`.
 */
export const o2oModule: ModuleConfig = {
  id: 'o2o',
  path: '/o2o',
  title: 'Địa điểm & in ấn',
  iconName: 'map-outline',
  color: 'lime',
  order: 110,
  featureFlag: 'o2o',
  tabTitles: {
    locations: 'Địa điểm',
    shops: 'Tiệm in',
    orders: 'Đơn in',
  },
  defaultTab: 'locations',
  page: { lazy: () => import('@/features/o2o/pages/O2oPage') },
  routes: [
    {
      // `locations/:id` · `shops/:id` · `orders/:id` — chuyển về tab tương ứng với ngăn kéo chi tiết mở (`:tab` lạ → về gốc).
      path: ':tab/:id',
      title: 'Chi tiết',
      hideInMenu: true,
      lazy: () => import('@/features/o2o/pages/O2oDetailRedirectPage'),
    },
  ],
};
