/**
 * Đường dẫn admin O2O — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/o2o/admin-o2o.routes.ts`:
 * xem `o2o:view`, tạo `o2o:create`, sửa/ẩn/huỷ `o2o:update`, duyệt `o2o:approve`. Các route admin KHÔNG gắn cờ `o2o` ở BE
 * (vận hành chuẩn bị địa điểm/tiệm TRƯỚC khi bật cho người dùng), nhưng module admin vẫn ẩn theo cờ (`o2o.routes.tsx`).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const o2oApi = {
  /** GET `?page&limit&q&type&status&amenity` · POST tạo (201). */
  locations: '/admin/locations',
  /** GET chi tiết (kèm ảnh ký URL + tiệm) · PATCH `{ …, expectedVersion }` (409 `RES_003` khi lệch phiên bản). */
  location: (id: string) => `/admin/locations/${seg(id)}`,
  /** POST `{ reason }` — ẩn địa điểm (audit `o2o.location-hide`). */
  locationHide: (id: string) => `/admin/locations/${seg(id)}/hide`,
  locationUnhide: (id: string) => `/admin/locations/${seg(id)}/unhide`,
  /** GET `?cursor&limit` — mọi đánh giá KỂ CẢ đã ẩn (phân trang cursor). */
  locationReviews: (id: string) => `/admin/locations/${seg(id)}/reviews`,
  /** POST `{ reason }` — ẩn đánh giá vi phạm (điểm trung bình tính lại). */
  reviewHide: (id: string) => `/admin/location-reviews/${seg(id)}/hide`,
  reviewUnhide: (id: string) => `/admin/location-reviews/${seg(id)}/unhide`,

  /** GET `?page&limit&q&status` · POST tạo tiệm (PENDING; `O2O_009` không thấy chủ tiệm, `O2O_013` địa điểm không hợp lệ). */
  shops: '/admin/print-shops',
  /** GET chi tiết (+ `pendingOrders`) · PATCH `{ …, expectedVersion, reason? }`. */
  shop: (id: string) => `/admin/print-shops/${seg(id)}`,
  /** POST `{ reason }` (`o2o:approve`) → chủ tiệm có `partner:*` ≤ 60 giây. */
  shopApprove: (id: string) => `/admin/print-shops/${seg(id)}/approve`,
  /** POST `{ reason }` → đơn PENDING tự REJECTED "Tiệm tạm ngưng"; trả kèm `rejectedOrders`. */
  shopSuspend: (id: string) => `/admin/print-shops/${seg(id)}/suspend`,

  /** GET `?page&limit&shopId&status&paymentStatus&from&to&q` — KHÔNG PIN, KHÔNG URL tệp. */
  orders: '/admin/print-orders',
  order: (id: string) => `/admin/print-orders/${seg(id)}`,
  /** POST `{ reason }` — huỷ khi khiếu nại (audit `print.order-cancel-admin`), chỉ đơn chưa kết thúc. */
  orderCancel: (id: string) => `/admin/print-orders/${seg(id)}/cancel`,
} as const;
