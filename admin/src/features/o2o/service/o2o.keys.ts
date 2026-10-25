import { useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';

import type { AdminLocationsParams, AdminOrdersParams, AdminShopsParams } from '../types/o2o.types';

/**
 * Query key admin O2O (admin.md p6-05 §3). Mọi khoá cùng gốc `['o2o']` nên một thao tác ghi (duyệt tiệm, huỷ đơn…) làm mới đúng
 * các nơi bị ảnh hưởng chéo: tạm ngưng tiệm đổi cả danh sách địa điểm (chip "Tiệm in") lẫn đơn PENDING bị từ chối.
 */
export const o2oKeys = {
  all: ['o2o'] as const,
  locations: (params: AdminLocationsParams) => ['o2o', 'locations', params] as const,
  location: (id: string) => ['o2o', 'locations', 'detail', id] as const,
  /** Nằm DƯỚI `location(id)` nên làm mới chi tiết địa điểm cũng làm mới đánh giá. */
  reviews: (id: string) => ['o2o', 'locations', 'detail', id, 'reviews'] as const,
  shops: (params: AdminShopsParams) => ['o2o', 'shops', params] as const,
  shop: (id: string) => ['o2o', 'shops', 'detail', id] as const,
  orders: (params: AdminOrdersParams) => ['o2o', 'orders', params] as const,
  order: (id: string) => ['o2o', 'orders', 'detail', id] as const,
};

/** Làm mới mọi dữ liệu O2O + nhật ký quản trị — dùng sau MỌI thao tác ghi của vận hành. */
export const useInvalidateO2o = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: o2oKeys.all });
    void qc.invalidateQueries({ queryKey: auditLogKeys.all });
  };
};
