/**
 * DTO của báo cáo đóng góp (p4-06) — VIẾT TAY theo `be.md` §4–§5 và `modules/contribution` vì công cụ sinh kiểu OpenAPI
 * (p0-09) chưa có. ⚠️ Khi BE đổi tên trường thì CHỈ sửa file này và `contribution.service.ts` (`feature-structure.md`).
 *
 * ⛔ Bảng đóng góp CHỈ ĐỌC với mọi vai trò: không có kiểu nào ở đây mô tả việc sửa điểm/phần trăm của người khác. Việc ghi duy
 * nhất là công thức (`PutContributionConfigInput`) và yêu cầu xuất PDF.
 */

/** Khoá kỳ báo cáo: `ALL` · `M:2026-09` (tháng) · `W:2026-W37` (tuần ISO). */
export type PeriodKey = string;

export type MembershipState = 'ACTIVE' | 'ANONYMIZED' | 'LEFT';

export interface ContributionWeights {
  onTime: number;
  peer: number;
  points: number;
}

export interface ContributionUser {
  avatarUrl: string | null;
  id: string;
  membership: MembershipState;
  name: string;
}

/** Từng thành phần trên thang 0–1; `null` = chưa có dữ liệu (không phải 0). */
export interface ContributionComponents {
  onTime: number | null;
  peer: number | null;
  points: number | null;
}

export interface ContributionMember {
  components: ContributionComponents;
  /** Câu do SERVER dựng: "60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0" — app hiển thị nguyên văn. */
  explanation: string;
  /** 0–10; `null` khi chưa có lượt chấm. */
  peerScoreAvg: number | null;
  reviewCount: number;
  score: number;
  share: number;
  storyPointsDone: number;
  tasksDone: number;
  tasksLate: number;
  tasksOnTime: number;
  tasksWithDue: number;
  unestimatedTasks: number;
  user: ContributionUser;
  /** Trọng số THẬT SỰ dùng sau khi chia lại cho thành phần có dữ liệu (tổng 100). */
  weightsUsed: ContributionWeights;
}

/** Ba câu định nghĩa tiếng Việt do server trả — app hiển thị nguyên văn. */
export interface FormulaDefinitions {
  onTime: string;
  peer: string;
  points: string;
}

export interface ContributionFormula {
  changedAt: string | null;
  changedBy: { id: string; name: string } | null;
  definitions: FormulaDefinitions;
  formulaVersion: number;
  onTimeGraceHours: number;
  previousWeights: ContributionWeights | null;
  unestimatedPoints: number;
  weights: ContributionWeights;
}

export interface ContributionReport {
  boardId: string;
  computedAt: string | null;
  formula: ContributionFormula;
  /** Điểm thẻ của người nhiều nhất nhóm — mẫu số của thành phần điểm thẻ. */
  maxStoryPoints: number;
  members: ContributionMember[];
  period: { from: string | null; key: PeriodKey; timezone: string; to: string | null };
  /** Còn thay đổi chưa vào bản tính sẵn — banner "Đang cập nhật số liệu". */
  stale: boolean;
  totals: { storyPointsDone: number; tasksDone: number };
}

export interface ContributionPeriods {
  months: PeriodKey[];
  timezone: string;
  weeks: PeriodKey[];
}

export interface MemberTaskItem {
  assigneeCount: number;
  completedAt: string;
  deleted: boolean;
  dueDate: string | null;
  onTime: boolean | null;
  reviewCount: number;
  reviewScoreAvg: number | null;
  /** Điểm được tính cho NGƯỜI NÀY (đã chia đều theo số người làm). */
  sharedPoints: number;
  storyPoints: number | null;
  taskId: string;
  /** `null` khi thẻ đã xoá — app hiện "(đã xoá)". */
  title: string | null;
}

export interface MemberTasksPage {
  items: MemberTaskItem[];
  nextCursor: string | null;
}

/** `GET/PUT /boards/:id/contribution-config`. */
export interface ContributionConfig {
  changedAt: string | null;
  changedBy: { id: string; name: string } | null;
  definitions: FormulaDefinitions;
  isDefault: boolean;
  onTimeGraceHours: number;
  previousWeights: ContributionWeights | null;
  unestimatedPoints: number;
  /** `configVersion` — gửi lại làm `expectedVersion` khi lưu (CAS, lệch → `RES_003`). */
  version: number;
  weights: ContributionWeights;
}

export interface PutContributionConfigInput {
  expectedVersion: number;
  onTimeGraceHours: number;
  unestimatedPoints: number;
  weights: ContributionWeights;
}

export interface HeatmapDay {
  checklist: number;
  comment: number;
  /** `YYYY-MM-DD` theo múi giờ của nhóm (`pm.timezone`). */
  date: string;
  review: number;
  task: number;
  total: number;
}

export interface Heatmap {
  days: HeatmapDay[];
  from: string;
  maxTotal: number;
  timezone: string;
  to: string;
  userId?: string;
}

export interface HeatmapQuery {
  from: string;
  to: string;
  userId?: string;
}

export type ExportStatus = 'EXPIRED' | 'FAILED' | 'QUEUED' | 'READY' | 'RUNNING';

export interface CreateExportInput {
  includeHeatmap: boolean;
  period: PeriodKey;
}

export interface ExportRef {
  exportId: string;
  status: ExportStatus;
}

export interface ContributionExport {
  createdAt: string;
  dataHash: string;
  expiresAt: string;
  id: string;
  includeHeatmap: boolean;
  periodKey: PeriodKey;
  readyAt: string | null;
  /** Mã in ở chân trang PDF để đối chiếu. */
  verifyCode: string;
  status: ExportStatus;
  /** CHỈ có khi gọi `?download=1` và tệp READY — URL ký sống ≤ 60 giây, lấy NGAY lúc bấm mở. */
  url?: string;
}

/** Thông tin bảng cần cho màn (tên, lưu trữ, quyền) — đọc từ `GET /boards/:id`, KHÔNG import feature `boards`. */
export interface BoardMeta {
  archivedAt: string | null;
  id: string;
  myPermissions: string[];
  name: string;
}

/** Payload `board:updated` — chỉ phần màn này dùng; `contributionChanged` do `PUT contribution-config` đặt. */
export interface BoardUpdatedEvent {
  boardId: string;
  contributionChanged?: boolean;
}

/**
 * Lát TỐI THIỂU của `GET /workspaces/:id`: múi giờ ĐANG được dùng để tính "ngày" của nhóm (`effectiveTimezone` — luôn là IANA hợp lệ; BE dựng từ
 * `Workspace.timezone` → mặc định hệ thống). Heatmap cấp nhóm cần nó để biết "hôm nay" là ngày nào trước khi gọi `activity-heatmap`.
 */
export interface WorkspaceTimezone {
  effectiveTimezone?: string | null;
}

/** Thành viên nhóm cho bộ chọn của heatmap cấp nhóm — endpoint của `members` (p1-02), chỉ những trường màn này dùng. */
export interface WorkspaceMemberOption {
  avatarUrl: string | null;
  displayName: string | null;
  name: string;
  userId: string;
}
