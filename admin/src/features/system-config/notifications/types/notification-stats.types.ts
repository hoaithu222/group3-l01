/**
 * Kiểu dữ liệu khối "Số liệu thông báo tin nhắn" (p1-07 admin.md §2.1) — khớp
 * `NotificationStats` của `be/src/modules/notifications/services/notification-stats.ts`
 * qua `GET /admin/notifications/stats?range=24h|7d`
 * (`be/src/modules/admin-notifications`, quyền `system-config:view`).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi p0-09 xong.
 *
 * ⛔ CHỈ chỉ số GỘP: BE đếm bằng bộ đếm Redis theo giờ/ngày, KHÔNG có định danh người dùng,
 * không tra cứu hộp thư/cài đặt của một người. Không thêm trường nào nêu người/nội dung.
 * Redis không khả dụng → mọi số về 0 (BE không lỗi).
 */

export type NotificationStatsRange = '24h' | '7d';

/** Lý do một push bị chặn (`PushSkipReason` phía BE, viết thường). */
export interface NotificationSuppressed {
  muted: number;
  dnd: number;
  viewing: number;
  read: number;
  blocked: number;
}

export interface NotificationStats {
  range: NotificationStatsRange;
  pushSent: number;
  pushFailed: number;
  /** Token FCM/APNs hỏng đã được dọn trong khoảng. */
  invalidTokensRemoved: number;
  suppressed: NotificationSuppressed;
  /**
   * p95 thời gian fan-out (ms), ước lượng từ histogram — là CẬN TRÊN của bucket chứa phân vị 95
   * (`FANOUT_BUCKETS_MS`, tối đa 10 000 cho bucket "inf"). `null` = chưa có job fan-out nào.
   */
  fanoutP95Ms: number | null;
  /** Mục hộp thư (Hoạt động) tạo mới. */
  inboxCreated: number;
  /** Số push theo loại (`message.new` · `mention` · `thread.reply`); loại lạ vẫn hiện được. */
  byType: Record<string, number>;
}

/**
 * Giới hạn vận hành của thông báo — khớp `NotificationLimitsView` của
 * `be/src/modules/admin-notifications/admin-notifications.service.ts` (lấy từ `LIMITS.notification`).
 * CHỈ đọc: BE không phơi qua registry `/admin/system-config`, admin không sửa được.
 */
export interface NotificationLimitsView {
  /** Cửa sổ gộp push (giây). */
  pushBatchWindowSeconds: number;
  /** Số ngày giữ mục hộp thư (Hoạt động). */
  inboxRetentionDays: number;
  /** Số người nhận mỗi lô fan-out. */
  fanoutChunkSize: number;
  /** Số thiết bị nhận push tối đa mỗi người dùng. */
  maxDevicesPerUser: number;
  /** Số ngày giữ bộ đếm số liệu thông báo. */
  statsRetentionDays: number;
}

/**
 * `GET /admin/notifications/stats` → `data` (`AdminNotificationStats` phía BE). `limits` tuỳ chọn
 * phía client: BE bản cũ chưa trả trường này → khối "Giới hạn" ẩn thay vì vỡ.
 */
export interface AdminNotificationStats extends NotificationStats {
  limits?: NotificationLimitsView;
}
