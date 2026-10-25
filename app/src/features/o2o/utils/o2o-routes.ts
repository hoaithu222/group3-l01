import type { Href } from 'expo-router';

/**
 * Đường dẫn màn của feature — MỘT nơi để đổi. Route nằm dưới `app/(app)/me/o2o/**` (KHÔNG phải `(app)/o2o/**` như app.md ghi:
 * thư mục mới cấp `(app)/` bị Expo Router tự dựng thành TAB; `me/` đã có `_layout.tsx` kiểu Stack nên màn con không thành tab).
 *
 * ⛔ Mỗi hàm trả `Href` bằng `return` tường minh — KHÔNG `cond ? a : b` / `a ?? b` trong MỘT biểu thức: `Href` đã vài trăm mục, TS rút
 * gọn union quá giới hạn (TS2590). Cần rẽ nhánh thì `if`/`return`.
 */

export const O2O_MAP_HREF = '/me/o2o/map' satisfies Href;
// ⚠️ `orders.tsx` chứ KHÔNG phải `print/index.tsx`: route chỉ-có-`index` trong thư mục không có `_layout.tsx` bị bộ sinh typed routes của Metro (bộ theo dõi file,
// `.expo/types`) sinh thất thường `/x/index` thay vì `/x` — `tsc` đỏ dù `npm run typecheck` xanh. Tên file thường thì cả hai bộ sinh cùng cho `/me/o2o/orders`.
export const O2O_ORDERS_HREF = '/me/o2o/orders' satisfies Href;

export function locationHref(locationId: string): Href {
  return { pathname: '/me/o2o/locations/[locationId]', params: { locationId } };
}

export function orderTicketHref(orderId: string): Href {
  return { pathname: '/me/o2o/print/[orderId]', params: { orderId } };
}

/** Tham số của màn cấu hình đơn (`type` chứ không `interface`: typed routes đòi kiểu gán được cho chỉ mục chuỗi): đặt in ở `shopId`, tệp có sẵn từ Resource Hub (`resourceId` + `resourceName` để hiện tên) hoặc tiếp tục đơn nháp (`orderId`). */
export type NewOrderParams = {
  shopId?: string;
  locationName?: string;
  resourceId?: string;
  resourceName?: string;
  orderId?: string;
};

export function newOrderHref(params: NewOrderParams): Href {
  return { pathname: '/me/o2o/print/new', params };
}
