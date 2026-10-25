import type { ColumnKindValue } from "../../../core/constants/project";

export type ReviewStateValue = "NONE" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED";

/** Mục checklist nhúng trong `Task.checklist[]` (p3-03). `order` là số thực — chèn giữa hai mục = trung bình. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  doneBy: string | null;
  doneAt: Date | null;
  order: number;
}

/** p7-04 — tin nhắn nguồn của thẻ tạo từ chat: CHỈ tham chiếu (không sao chép nội dung riêng tư); người mở tin không có quyền đọc → 404 của `messages`. */
export interface TaskSourceMessage {
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  messageId: string;
  workspaceId: string | null;
}

/** Thẻ (`Task`) — các trường checklist/mô tả/đính kèm thuộc p3-03 nhưng khai chung để mapper không phải đổi. */
export interface Task {
  id: string;
  boardId: string;
  workspaceId: string;
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  assigneeIds: string[];
  labelIds: string[];
  startDate: Date | null;
  dueDate: Date | null;
  storyPoints: number | null;
  /** Đã sắp theo `order` tăng dần khi đọc từ repository. */
  checklist: ChecklistItem[];
  checklistDone: number;
  checklistTotal: number;
  attachmentCount: number;
  commentCount: number;
  reviewState: ReviewStateValue;
  completedAt: Date | null;
  completionCount: number;
  createdBy: string;
  clientTaskId: string | null;
  dueVersion: number;
  deletedFromColumnId: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  /** p4-04 — thẻ trước/thẻ sau chưa DONE, chưa xoá (phi chuẩn hoá; tuỳ chọn để bản in-memory/test cũ không phải khai). */
  blockedByCount?: number;
  blockingCount?: number;
  /** p7-04 — thẻ tạo từ một tin nhắn (`ITaskCreationPort`); vắng/`null` = thẻ tạo tay. Tuỳ chọn để bản in-memory/test cũ không phải khai. */
  sourceMessageRef?: TaskSourceMessage | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Đầu vào tạo thẻ — repository ghi `null` TƯỜNG MINH cho mọi trường sau này lọc bằng `{field: null}`. */
export interface TaskCreateInput {
  boardId: string;
  workspaceId: string;
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  title: string;
  normalizedTitle: string;
  assigneeIds: string[];
  labelIds: string[];
  dueDate: Date | null;
  dueVersion: number;
  completedAt: Date | null;
  completionCount: number;
  createdBy: string;
  clientTaskId: string | null;
  /** (p3-03 P1: sao chép thẻ) Trường đặt sẵn lúc tạo; vắng = rỗng như tạo thường. */
  description?: string | null;
  startDate?: Date | null;
  storyPoints?: number | null;
  /** Mục checklist đặt sẵn (mọi mục `done: false`); `checklistTotal` = độ dài. */
  checklist?: ChecklistItem[];
  /** p7-04: thẻ tạo từ tin nhắn. */
  sourceMessageRef?: TaskSourceMessage | null;
}

/** Phần "hạt giống" của `TaskCreateInput` mà người tạo thẻ (sao chép) có thể truyền thêm ngoài `CreateTaskDto`. */
export type TaskSeed = Pick<TaskCreateInput, "description" | "startDate" | "storyPoints" | "checklist" | "sourceMessageRef">;

/** Tập trường `PATCH /tasks/:id` đổi (CAS `where { id, version, deletedAt: null }`, `version +1`). Trường vắng = giữ nguyên. */
export interface TaskPatchSet {
  title?: string;
  normalizedTitle?: string;
  description?: string | null;
  assigneeIds?: string[];
  labelIds?: string[];
  startDate?: Date | null;
  dueDate?: Date | null;
  /** Tăng mỗi lần `dueDate` đổi (jobId nhắc hạn). */
  dueVersion?: number;
  storyPoints?: number | null;
}

/** Ngày mới của một thẻ bị dời lịch theo phụ thuộc (p4-04). `bumpDueVersion` khi `dueDate` thật sự đổi (jobId nhắc hạn theo `dueVersion`). */
export interface TaskRescheduleSet {
  startDate: Date | null;
  dueDate: Date | null;
  bumpDueVersion: boolean;
}

/** Vị trí/trạng thái mới khi khôi phục thẻ (CAS theo `version`, `version +1`). */
export interface TaskRestoreSet {
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  completedAt: Date | null;
  completionCount: number;
}

/** Kết quả một thao tác checklist trên MỘT mục (thẻ đọc lại SAU khi ghi). */
export interface ChecklistMutation {
  /** `false` khi thao tác không đổi gì (tick lặp, mục không còn…). */
  changed: boolean;
  task: Task;
}

/** Tập trường `move` đổi (CAS `where { id, version }`, `version` +1). */
export interface TaskMoveSet {
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  completedAt: Date | null;
  completionCount: number;
}

export interface TaskListFilter {
  assigneeId?: string;
  labelId?: string;
  overdue?: boolean;
  dueBefore?: Date;
  /** Đã chuẩn hoá (`normalizeSearch`). */
  q?: string;
}

export type AdjacentDirection = "after" | "before";

export interface TaskActivityInput {
  taskId: string;
  boardId: string;
  workspaceId: string;
  actorId: string | null;
  type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  groupKey: string | null;
}

export interface TaskActivity extends TaskActivityInput {
  id: string;
  at: Date;
}
