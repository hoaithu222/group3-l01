import { formatNumber } from '@/shared/utils/format';

/** Câu "tác động" của tạm ngưng — NÊU SỐ đơn chờ nhận sắp bị từ chối để vận hành biết mình đang làm gì (BE `pendingOrders`). */
export function suspendImpact(pendingOrders: number): string {
  const orders =
    pendingOrders > 0
      ? `${formatNumber(pendingOrders)} đơn đang chờ tiệm nhận sẽ tự bị từ chối với lý do "Tiệm tạm ngưng" (khách được thông báo)`
      : 'Hiện không có đơn nào đang chờ tiệm nhận bị ảnh hưởng';
  return `Chủ tiệm mất quyền vào cổng tiệm in ngay sau khi tạm ngưng. ${orders}; đơn đã nhận hoặc đang in không đổi.`;
}
