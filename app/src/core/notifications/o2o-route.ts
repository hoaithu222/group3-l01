import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * In ấn O2O (p6-05): thông báo `print-order.*` của BE (`be/src/modules/o2o/services/o2o-notifications.ts`, `dataKeys: ["orderId", "code"]`) → đích. Tách khỏi
 * `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `mentor-route.ts`/`study-route.ts`).
 *
 * Push/hộp thư chỉ mang id (`orderId`, `code`) — KHÔNG nội dung, KHÔNG PIN; màn vé tự tải lại và nói "không tìm thấy đơn" khi BE trả 404 (đơn của người khác
 * cũng 404 trung tính — IR-13). ⛔ Không kiểm quyền ở đây.
 *
 *  · `print-order.accepted|rejected|ready|picked-up|cancelled|expiring|expired` → vé đơn (`/me/o2o/print/{orderId}`).
 *  · `print-order.new` là thông báo gửi cho CHỦ TIỆM ("có đơn mới") — chủ tiệm làm việc ở admin (`audience partner`), không có màn nhận đơn ở app ⇒ `null`
 *    (rơi về hộp thư Hoạt động). Mở vé đơn của khách bằng tài khoản chủ tiệm chỉ ra 404.
 *  · Thiếu `orderId` → `null` (hộp thư).
 *
 * ⚠️ `Href` dạng object có `pathname` + `params` (kiểm kiểu theo bảng route sinh từ `app/app/`), khác `mentor-route.ts` ép chuỗi: route ở đây có tham số
 * nên dạng object là dạng chuẩn và không dính bẫy route chỉ-có-`index`.
 */
export function isO2oType(type: string): boolean {
  return type.startsWith('print-order.');
}

export function o2oHref({ orderId, type }: NotificationTarget): Href | null {
  if (!orderId || type === 'print-order.new') return null;
  return { params: { orderId }, pathname: '/me/o2o/print/[orderId]' };
}
