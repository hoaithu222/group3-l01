/**
 * Query key cổng chủ tiệm (admin.md p6-05 §3): `partnerKeys.orders(status)`, `.order(id)`, `.shop()`. Cùng gốc `['partner']` nên
 * một thao tác ghi (nhận đơn, giao hàng) hay một sự kiện socket làm mới đúng mọi nơi cần: hàng đợi, chi tiết đơn, tiệm.
 */
export const partnerKeys = {
  all: ['partner'] as const,
  shops: () => ['partner', 'shops'] as const,
  orders: (status: string) => ['partner', 'orders', 'list', status] as const,
  order: (id: string) => ['partner', 'orders', 'detail', id] as const,
};
