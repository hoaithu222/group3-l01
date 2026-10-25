/**
 * Đường dẫn cổng chủ tiệm — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/o2o/partner.routes.ts`: mọi route cần
 * cờ `o2o` (tắt → `404 CFG_005`) và quyền THEO DỮ LIỆU `partner:view` (đọc) / `partner:update` (ghi) — chỉ chủ tiệm APPROVED có.
 * Đơn của tiệm khác → 404 trung tính (`ScopeNotFoundError`).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const partnerApi = {
  /** GET → mảng tiệm của tôi (kèm trạng thái duyệt, bảng giá chỉ đọc). */
  shops: '/partner/shops/me',
  /** POST `{ acceptingOrders }` (`partner:update`) → `{ id, acceptingOrders }`. */
  accepting: (shopId: string) => `/partner/shops/${seg(shopId)}/accepting`,
  /** GET `?status=PENDING,ACCEPTED,…&cursor&limit` — không PIN, không tệp. */
  orders: '/partner/orders',
  order: (id: string) => `/partner/orders/${seg(id)}`,
  /** POST — PENDING → ACCEPTED. */
  accept: (id: string) => `/partner/orders/${seg(id)}/accept`,
  /** POST `{ reason }` — PENDING → REJECTED. */
  reject: (id: string) => `/partner/orders/${seg(id)}/reject`,
  /** POST — ACCEPTED → PRINTING. */
  printing: (id: string) => `/partner/orders/${seg(id)}/printing`,
  /** POST — PRINTING → READY (khách nhận thông báo). */
  ready: (id: string) => `/partner/orders/${seg(id)}/ready`,
  /** GET → URL ký tải tệp; CHỈ ACCEPTED/PRINTING (`O2O_006` ngoài hai trạng thái đó), audit `print.file-download`. */
  file: (id: string) => `/partner/orders/${seg(id)}/file`,
  /** POST `{ pin, markPaid }` — `O2O_007` (400, `details.attemptsLeft`), `O2O_008` (423, `details.retryAfterSeconds`). */
  pickup: (id: string) => `/partner/orders/${seg(id)}/pickup`,
  /** POST — đánh dấu đã thu tiền (READY/PICKED_UP, idempotent). */
  markPaid: (id: string) => `/partner/orders/${seg(id)}/mark-paid`,
} as const;
