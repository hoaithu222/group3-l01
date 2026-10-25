/**
 * Đường dẫn endpoint tab "Thông báo" — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 *
 * LỆCH plan p0-06 (admin.md §2.1/§2.3): plan gắn trạng thái provider và số liệu
 * dưới `/admin/system-config/notifications*`, nhưng đó là khoá registry
 * `SystemConfig` chứ không phải route đọc hạ tầng — BE đặt cạnh công cụ gửi thử,
 * ở `be/src/modules/admin-push`.
 */
export const notificationsConfigApi = {
  /** GET — trạng thái FCM / APNs VoIP (chỉ cờ, không khoá). Quyền `system-config:view`. */
  providerStatus: '/admin/push/status',
  /** GET — số liệu push 24 giờ / token bị gỡ 7 ngày (BE cache 60 giây). Quyền `system-config:view`. */
  stats: '/admin/push/stats',
  /**
   * GET `?range=24h|7d` — số liệu THÔNG BÁO TIN NHẮN gộp (push gửi/lỗi/bị chặn, fan-out p95, mục hộp
   * thư) của p1-07 (`be/src/modules/admin-notifications`); nguồn là bộ đếm Redis, khác `stats` ở trên
   * (tổng hợp từ DB của p0-06). Quyền `system-config:view`.
   */
  messageStats: '/admin/notifications/stats',
  /** POST `{ userId, type, reason }` — vai `admin` + quyền `system-config:update`. */
  pushTest: '/admin/push/test',
  /** GET `?q=&status=&limit=` — tìm người nhận (quyền `user:view`). */
  users: '/users',
} as const;
