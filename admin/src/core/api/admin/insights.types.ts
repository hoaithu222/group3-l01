/**
 * `GET /admin/overview/insights?range=7d|30d|90d` — số liệu PHÂN TÍCH cho trang Tổng quan (biểu đồ xu hướng, so với kỳ trước, phân bổ).
 * Quyền `dashboard:view`. HỢP ĐỒNG DÙNG CHUNG với `be/src/modules/admin-overview/admin-overview-insights.service.ts` — đổi tên trường ở một
 * bên là phải đổi cả bên kia (BE hiện viết tay interface cùng tên, chưa sinh từ `openapi.json`).
 *
 * Quy ước:
 *  - Ngày `YYYY-MM-DD` theo UTC (cùng `activeUsersSeries` của `GET /admin/overview`); mọi chuỗi được LẤP ĐỦ 0 cho ngày không có dữ liệu và
 *    sắp tăng dần theo ngày, độ dài đúng bằng số ngày của `range`.
 *  - Trường VẮNG (`undefined`) = phân hệ đó đang tắt cờ (`communication` / `voice`+`meeting` / `gamification`) hoặc BE không tính được —
 *    giao diện ẨN khối tương ứng, KHÔNG hiện số 0 (0 là một con số thật).
 *  - CHỈ số đếm tổng hợp, KHÔNG có danh tính người dùng (riêng tư — xem `admin.md` §2).
 */
export type InsightsRange = '7d' | '30d' | '90d';

/** Một điểm của chuỗi theo ngày. */
export interface InsightsSeriesPoint {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

/** Một chỉ số trong kỳ hiện tại kèm cùng chỉ số của kỳ LIỀN TRƯỚC (cùng số ngày) để tính ▲▼. */
export interface InsightsMetric {
  current: number;
  /** `null` = không so sánh được (kỳ trước không có dữ liệu để so, ví dụ hệ thống mới chạy). */
  previous: number | null;
}

export interface InsightsKpis {
  /** Tổng người dùng hiện có (đã trừ tài khoản ẩn danh hoá) — số tức thời, không có kỳ trước. */
  totalUsers: number;
  /** Người dùng đăng ký mới trong kỳ. */
  newUsers: InsightsMetric;
  /** Người dùng duy nhất có phiên hoạt động (`Session.lastUsedAt`) trong kỳ. */
  activeUsers: InsightsMetric;
  /** Tin nhắn người dùng gửi (loại tin hệ thống, tin đã xoá) — cờ `communication`. */
  messages?: InsightsMetric;
  /** Cuộc gọi bắt đầu trong kỳ — cờ `voice` hoặc `meeting`. */
  calls?: InsightsMetric;
  /** Tổng phút của cuộc gọi đã kết thúc trong kỳ (làm tròn) — cờ `voice` hoặc `meeting`. */
  callMinutes?: InsightsMetric;
  /** Tổng XP đã cấp trong kỳ (không tính dòng bị chặn `capped`/`blockedReason`) — cờ `gamification`. */
  xpAwarded?: InsightsMetric;
  /** Số huy hiệu được mở khoá trong kỳ — cờ `gamification`. */
  badgesUnlocked?: InsightsMetric;
}

/** Các chuỗi theo ngày. `signups` và `activeUsers` luôn có; còn lại theo cờ phân hệ. */
export interface InsightsSeries {
  signups: InsightsSeriesPoint[];
  activeUsers: InsightsSeriesPoint[];
  messages?: InsightsSeriesPoint[];
  calls?: InsightsSeriesPoint[];
  callMinutes?: InsightsSeriesPoint[];
  xp?: InsightsSeriesPoint[];
}

/** Một phần tử của biểu đồ phân bổ. `key` là mã máy (enum BE) — nhãn tiếng Việt do FE tra bảng; mã lạ hiện nguyên `key`. */
export interface InsightsBreakdownItem {
  key: string;
  count: number;
}

export interface InsightsBreakdowns {
  /** `ACTIVE` | `LOCKED` | `PENDING_DELETION` | `ANONYMIZED`… — tình trạng tài khoản (snapshot). */
  userStatus: InsightsBreakdownItem[];
  /** Vai trò hệ thống của tài khoản (`admin`, `manager`, `user`…) — snapshot. */
  userRole: InsightsBreakdownItem[];
  /** Báo cáo kiểm duyệt tạo trong kỳ theo trạng thái (`OPEN`, `RESOLVED`…) — cờ `communication`. */
  reportStatus?: InsightsBreakdownItem[];
  /** Cuộc gọi trong kỳ theo loại media (`AUDIO` | `VIDEO`…) — cờ `voice`/`meeting`. */
  callMedia?: InsightsBreakdownItem[];
  /** Tin nhắn trong kỳ theo phạm vi (`CHANNEL` | `CONVERSATION`…) — cờ `communication`. */
  messageScope?: InsightsBreakdownItem[];
  /** XP cấp trong kỳ theo nguồn (`sourceType`), GIẢM dần, tối đa 8 dòng — cờ `gamification`. `count` = tổng XP. */
  xpBySource?: InsightsBreakdownItem[];
  /** Phân bố cấp độ người dùng (`key` = số cấp dạng chuỗi, `count` = số người), tối đa 10 cấp có người — cờ `gamification`. */
  levelDistribution?: InsightsBreakdownItem[];
}

/** Bản đồ nhiệt hoạt động theo thứ × giờ (tin nhắn trong kỳ). `cells[thứ][giờ]`, thứ 0 = Thứ Hai … 6 = Chủ nhật, giờ 0–23. */
export interface InsightsHeatmap {
  /** Múi giờ dùng để chia giờ/thứ — cố định `Asia/Ho_Chi_Minh` (cùng `callsToday` của `media`). */
  timezone: string;
  /** 7 hàng × 24 cột. */
  cells: number[][];
  /** Giá trị lớn nhất trong `cells` (0 khi chưa có hoạt động) — FE chia thang màu. */
  max: number;
}

/** Workspace sôi động nhất kỳ (theo số tin nhắn). Tên workspace không phải dữ liệu cá nhân. */
export interface InsightsTopWorkspace {
  id: string;
  name: string;
  memberCount: number;
  /** Tin nhắn người dùng gửi trong kỳ. */
  messages: number;
}

export interface AdminInsights {
  range: InsightsRange;
  /** Thời điểm BE tính (ISO) — hiện "Cập nhật lúc …". BE cache ~60 s nên có thể cũ hơn giờ gọi. */
  generatedAt: string;
  kpis: InsightsKpis;
  /** Chuỗi kỳ HIỆN TẠI. */
  series: InsightsSeries;
  /** Chuỗi kỳ LIỀN TRƯỚC, CÙNG khoá + CÙNG độ dài với `series` (so sánh theo chỉ số vị trí: ngày thứ i ↔ ngày thứ i). `date` là ngày thật của kỳ trước. */
  previousSeries: InsightsSeries;
  breakdowns: InsightsBreakdowns;
  /** Vắng khi cờ `communication` tắt. */
  activityHeatmap?: InsightsHeatmap;
  /** Tối đa 5 dòng, giảm dần theo `messages` — vắng khi cờ `communication` tắt. */
  topWorkspaces?: InsightsTopWorkspace[];
}
