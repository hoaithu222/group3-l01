/**
 * Payload sự kiện `ops:stats` (S→C, phòng `admin:ops`) — khớp
 * `be/src/modules/admin-overview/jobs/ops-stats.job.ts` (`broadcastOpsStats`) + phong bì `stampPayload`
 * của `emitToRoom` (`v`, `serverNow`). CHỈ số đếm vận hành, KHÔNG có danh tính người dùng.
 *
 * Cùng dạng `AdminOverviewRealtime` của `GET /admin/overview` — client vá thẳng vào cache, không refetch.
 */
export interface OpsStatsPayload {
  /** Tổng số socket đang mở. */
  socketConnections: number;
  /** Số user duy nhất đang có ít nhất 1 kết nối. */
  onlineUsers: number;
  /** Phiên bản phong bì (hiện 1). */
  v?: number;
  /** Giờ máy chủ lúc phát (ISO). */
  serverNow?: string;
}
