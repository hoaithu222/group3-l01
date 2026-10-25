import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";

export type { ContributionConfigValue, ContributionWeights };

/** Thành phần điểm (0..1) — `null` = chưa có dữ liệu (trọng số được chia lại cho các thành phần còn lại). */
export interface ContributionComponents {
  points: number | null;
  onTime: number | null;
  peer: number | null;
}

/** Fact thẻ đã hoàn thành (một bản ghi/thẻ). */
export interface TaskFact {
  taskId: string;
  boardId: string;
  workspaceId: string;
  assigneeIds: string[];
  storyPoints: number | null;
  dueDate: Date | null;
  completedAt: Date;
  completionCount: number;
  active: boolean;
  reviewApproved: boolean | null;
}

export type TaskFactInput = Omit<TaskFact, "active">;

/** Kết quả áp `task.completed` — idempotent theo `completionCount`. */
export type CompletedOutcome = "CREATED" | "UPDATED" | "SKIPPED";
/** Kết quả áp `task.reopened`. */
export type ReopenedOutcome = "DEACTIVATED" | "PLACEHOLDER" | "SKIPPED";

export interface ReopenedInput {
  taskId: string;
  boardId: string;
  workspaceId: string;
  assigneeIds: string[];
  completionCount: number;
  reopenedAt: Date;
}

export type ReviewFactStatus = "APPROVED" | "REQUEST_CHANGES";

export interface ReviewFact {
  reviewId: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  reviewerId: string;
  assigneeIds: string[];
  status: ReviewFactStatus;
  score10: number | null;
  submittedAt: Date;
}

/** Một dòng thành viên do bộ tính trả về (số gốc + thành phần + điểm + %). */
export interface MemberContribution {
  userId: string;
  storyPointsDone: number;
  tasksDone: number;
  unestimatedTasks: number;
  tasksWithDue: number;
  tasksOnTime: number;
  tasksLate: number;
  reviewCount: number;
  peerScoreAvg: number | null;
  components: ContributionComponents;
  weightsUsed: ContributionWeights;
  score: number;
  share: number;
}

export interface ContributionTotals {
  storyPointsDone: number;
  tasksDone: number;
}

export interface ContributionSnapshotRow extends MemberContribution {
  workspaceId: string;
  boardId: string;
  periodKey: string;
  /** Tổng của CẢ NHÓM trong kỳ (mỗi thẻ một lần) — lặp lại ở mọi dòng của bảng/kỳ. */
  teamTasksDone: number;
  teamStoryPoints: number;
  formulaVersion: number;
  computedAt: Date;
}

export interface BoardState {
  boardId: string;
  workspaceId: string;
  factsVersion: number;
  computedVersion: number;
  computedAt: Date | null;
  configVersion: number;
  configChangedAt: Date | null;
  configChangedBy: string | null;
  previousWeights: ContributionWeights | null;
  defaultsSnapshot: ContributionConfigValue | null;
  activityDirtyAt: Date | null;
  activityRefreshedAt: Date | null;
  /** Múi giờ đã dùng cho snapshot `ALL`/`M:*` gần nhất — `null` = chưa tính lần nào. */
  snapshotTimezone: string | null;
  /** Múi giờ của các ô heatmap đã lấp toàn bộ lịch sử — `null` = chưa lấp. */
  activityTimezone: string | null;
  updatedAt: Date;
}

/** Bảng (chỉ trường cần) — đọc từ `Board` của module `projects`. */
export interface BoardRef {
  id: string;
  workspaceId: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  /** `Board.version` — phát kèm `board:updated` khi đổi công thức. */
  version: number;
  /** `Board.contribution` thô (JSON) — `null` khi bảng chưa được tuỳ chỉnh. */
  contribution: unknown;
}

export type MembershipState = "ACTIVE" | "LEFT" | "ANONYMIZED";

export interface DirectoryUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  membership: MembershipState;
}

export interface TaskRef {
  id: string;
  title: string;
  deleted: boolean;
}

/** Một ô heatmap: đếm theo `(bảng, người, ngày)`. */
export interface ActivityCell {
  boardId: string;
  workspaceId: string;
  userId: string;
  date: string;
  taskEvents: number;
  checklistEvents: number;
  commentEvents: number;
  reviewEvents: number;
}

export type ExportStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

export interface ContributionExportRecord {
  id: string;
  workspaceId: string;
  boardId: string;
  requestedBy: string;
  periodKey: string;
  includeHeatmap: boolean;
  status: ExportStatus;
  dedupeKey: string;
  dataHash: string;
  verifyCode: string;
  weights: ContributionWeights;
  memberCount: number;
  assetId: string | null;
  error: string | null;
  createdAt: Date;
  readyAt: Date | null;
  expiresAt: Date;
}
