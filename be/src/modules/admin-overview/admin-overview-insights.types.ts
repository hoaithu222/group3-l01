/**
 * Hợp đồng `GET /admin/overview/insights?range=7d|30d|90d` — KHỚP `admin/src/core/api/admin/insights.types.ts` (viết tay hai bên, chưa sinh từ
 * `openapi.json`): đổi tên/nghĩa trường ở một bên là phải đổi cả bên kia. Giữ nguyên tên interface để đối chiếu bằng mắt.
 *
 * Quy ước (xem file FE để biết đầy đủ):
 *  - Ngày `YYYY-MM-DD` theo UTC; mọi chuỗi LẤP ĐỦ 0, tăng dần theo ngày, độ dài đúng bằng số ngày của `range`.
 *  - Trường VẮNG = phân hệ tắt cờ (hoặc khối đó lỗi khi tính) — FE ẩn khối, KHÔNG hiện 0.
 *  - CHỈ số đếm tổng hợp, KHÔNG danh tính người dùng.
 */
export type InsightsRange = "7d" | "30d" | "90d";

export interface InsightsSeriesPoint {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

export interface InsightsMetric {
  current: number;
  /** `null` = kỳ trước chưa nằm trọn trong thời gian hệ thống hoạt động (User cũ nhất mới hơn đầu kỳ trước) — không so sánh được. */
  previous: number | null;
}

export interface InsightsKpis {
  /** Tổng người dùng hiện có (trừ tài khoản ẩn danh hoá) — số tức thời. */
  totalUsers: number;
  newUsers: InsightsMetric;
  /** Số userId DUY NHẤT có `Session.lastUsedAt` trong kỳ. */
  activeUsers: InsightsMetric;
  /** Cờ `communication`. */
  messages?: InsightsMetric;
  /** Cờ `voice` hoặc `meeting`. */
  calls?: InsightsMetric;
  /** Tổng phút (làm tròn) của cuộc gọi ĐÃ KẾT THÚC trong kỳ — cờ `voice` hoặc `meeting`. */
  callMinutes?: InsightsMetric;
  /** Cờ `gamification`. */
  xpAwarded?: InsightsMetric;
  /** Cờ `gamification`. */
  badgesUnlocked?: InsightsMetric;
}

export interface InsightsSeries {
  signups: InsightsSeriesPoint[];
  activeUsers: InsightsSeriesPoint[];
  messages?: InsightsSeriesPoint[];
  calls?: InsightsSeriesPoint[];
  callMinutes?: InsightsSeriesPoint[];
  xp?: InsightsSeriesPoint[];
}

export interface InsightsBreakdownItem {
  /** Mã máy (enum BE) — nhãn tiếng Việt do FE tra bảng. */
  key: string;
  count: number;
}

export interface InsightsBreakdowns {
  userStatus: InsightsBreakdownItem[];
  userRole: InsightsBreakdownItem[];
  /** Báo cáo tạo trong kỳ theo trạng thái — cờ `communication`. */
  reportStatus?: InsightsBreakdownItem[];
  /** Cuộc gọi trong kỳ theo `mediaKind` — cờ `voice`/`meeting`. */
  callMedia?: InsightsBreakdownItem[];
  /** Tin nhắn trong kỳ theo `scopeType` — cờ `communication`. */
  messageScope?: InsightsBreakdownItem[];
  /** XP theo `sourceType`, giảm dần, tối đa 8 dòng; `count` = tổng XP — cờ `gamification`. */
  xpBySource?: InsightsBreakdownItem[];
  /** `key` = số cấp (chuỗi), `count` = số người; tối đa 10 cấp có người — cờ `gamification`. */
  levelDistribution?: InsightsBreakdownItem[];
}

export interface InsightsHeatmap {
  /** Cố định `Asia/Ho_Chi_Minh`. */
  timezone: string;
  /** 7 hàng (Thứ Hai = 0 … Chủ nhật = 6) × 24 cột (giờ 0–23). */
  cells: number[][];
  max: number;
}

export interface InsightsTopWorkspace {
  id: string;
  name: string;
  memberCount: number;
  messages: number;
}

export interface AdminInsights {
  range: InsightsRange;
  /** ISO — lúc BE tính (cache ~60 s nên có thể cũ hơn giờ gọi). */
  generatedAt: string;
  kpis: InsightsKpis;
  series: InsightsSeries;
  /** CÙNG khoá + CÙNG độ dài với `series` (ngày thứ i ↔ ngày thứ i); `date` là ngày thật của kỳ trước. */
  previousSeries: InsightsSeries;
  breakdowns: InsightsBreakdowns;
  activityHeatmap?: InsightsHeatmap;
  topWorkspaces?: InsightsTopWorkspace[];
}
