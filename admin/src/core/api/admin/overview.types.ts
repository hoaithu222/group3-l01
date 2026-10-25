/** Một điểm trong chuỗi người dùng hoạt động theo ngày. */
export interface AdminOverviewSeriesPoint {
  /** Ngày, dạng `YYYY-MM-DD`. */
  date: string;
  count: number;
}

/**
 * Số liệu realtime (p0-03) — đếm qua Redis registry `conn:*`, cache phía BE
 * 30s (`REALTIME_CACHE_MS` — `be/src/modules/admin-overview/admin-overview.service.ts`).
 * FE KHÔNG tự cache lại, KHÔNG hiển thị danh sách/tên người dùng (quyền riêng
 * tư) — CHỈ số đếm.
 */
export interface AdminOverviewRealtime {
  /** Tổng số socket đang mở (1 người có thể mở nhiều tab/thiết bị). */
  socketConnections: number;
  /** Số USER duy nhất đang có ít nhất 1 kết nối realtime. */
  onlineUsers: number;
}

/**
 * KPI gọi & họp (p2-07) — khớp `AdminOverviewMedia` phía BE (`be/src/shared/ports/admin-overview-media.port.ts`). Chỉ SỐ LIỆU tổng hợp, không id/tên.
 * VẮNG (`undefined`) khi cờ `meeting` và `voice` cùng tắt hoặc BE không đọc được — dashboard ẩn cả khối, không hiện ô rỗng.
 */
export interface AdminOverviewMedia {
  /** Cuộc họp đang diễn ra. */
  liveMeetings: number;
  /** Cuộc gọi bắt đầu từ 00:00 hôm nay (múi giờ Asia/Ho_Chi_Minh). */
  callsToday: number;
  /** Tổng phút của cuộc gọi đã kết thúc trong 7 ngày gần nhất. */
  callMinutes7d: number;
  /** Tổng dung lượng bản ghi hình sẵn sàng chưa xoá (byte). */
  recordingStorageBytes: number;
  /** Số bản ghi hình lỗi trong 24 giờ gần nhất. */
  egressFailed24h: number;
}

/**
 * `GET /admin/overview` — số liệu tổng quan cho `HomePage` (`docs/plan/admin-plan.md §3.1`).
 *
 * 4 chỉ số KPI + 1 chuỗi thời gian cho chart + 2 chỉ số realtime (p0-03). BE
 * gộp sẵn (cache ngắn phía BE), FE KHÔNG tự tính lại từ dữ liệu thô.
 */
export interface AdminOverview {
  /** Người dùng đăng ký mới trong 7 ngày gần nhất. */
  newUsers7d: number;
  /** Số workspace đang ở trạng thái ACTIVE. */
  activeWorkspaces: number;
  /** Báo cáo kiểm duyệt đang ở trạng thái OPEN (chờ xử lý). */
  openReports: number;
  /** Job AI thất bại trong 24 giờ gần nhất — ⏸ D-13, luôn 0 khi job AI tạm dừng. */
  failedAiJobs24h: number;
  /** Người dùng hoạt động theo ngày — vẽ line/area chart. */
  activeUsersSeries: AdminOverviewSeriesPoint[];
  /** p0-03 — kết nối/người dùng trực tuyến, cache BE 30s. */
  realtime: AdminOverviewRealtime;
  /** p2-07 — KPI gọi & họp; vắng khi cờ tắt (xem `AdminOverviewMedia`). */
  media?: AdminOverviewMedia;
}
