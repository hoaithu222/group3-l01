/**
 * DTO của p4-04 (phụ thuộc · dời lịch · Gantt) — VIẾT TAY theo `be.md` §3–§5 và mã BE
 * (`modules/projects/services/{dependency.presenter,reschedule-preview,reschedule.service,reschedule-batch.presenter,gantt.service}.ts`)
 * vì công cụ sinh kiểu OpenAPI (p0-09) chưa có. Khi BE đổi tên trường thì CHỈ sửa file này và các `*.service.ts` cùng nhóm.
 *
 * ✅ Đã đối chiếu với mã BE hoàn chỉnh (2026-09-25): mọi endpoint §4 đều có; `startDate` vắng trong `POST /reschedule` = GIỮ,
 * `null` = XOÁ (app luôn gửi tường minh); `GanttDto.tasks[].columnId` là trường BE thêm sau.
 */
import type { ColumnKind, TaskAssignee } from './boards.types';

// ── Phụ thuộc ────────────────────────────────────────────────────────────────

/** Một thẻ ở đầu kia của phụ thuộc (`GET /tasks/:id/dependencies`). */
export interface DependencyTaskDto {
  id: string;
  title: string;
  columnKind: ColumnKind;
  startDate: string | null;
  dueDate: string | null;
  assignees: TaskAssignee[];
}

export interface TaskDependenciesDto {
  /** Thẻ phải xong TRƯỚC — chính thẻ này "bị chặn bởi" chúng. */
  predecessors: DependencyTaskDto[];
  /** Thẻ đang chờ thẻ này — thẻ này "đang chặn" chúng. */
  successors: DependencyTaskDto[];
}

/** Cạnh vừa tạo (`POST` → 201; đã có → 200 bản cũ). */
export interface DependencyDto {
  id: string;
  predecessorId: string;
  successorId: string;
  type: 'FINISH_TO_START';
  createdBy: string;
  createdAt: string;
}

// ── Dời lịch ─────────────────────────────────────────────────────────────────

export type RescheduleSkipReason = 'DELETED' | 'DONE' | 'NO_DATES';

export interface RescheduleAffected {
  taskId: string;
  title: string;
  /** Chỉ có id — tên tra từ cache bảng (`resolveAssigneeNames`). */
  assigneeIds: string[];
  oldStartDate: string | null;
  oldDueDate: string | null;
  newStartDate: string | null;
  newDueDate: string | null;
  shiftDays: number;
}

export interface RescheduleSkipped {
  taskId: string;
  title: string;
  reason: RescheduleSkipReason;
}

/** `POST /tasks/:id/reschedule-preview` — cũng là `details.preview` của `TASK_006`/`TASK_019`. */
export interface ReschedulePreviewDto {
  source: { taskId: string; version: number; oldDueDate: string | null; newDueDate: string };
  /** `BULK` (> 200 thẻ) ⇒ áp bằng lô nền, trả `202`. */
  mode: 'BULK' | 'SYNC';
  affectedCount: number;
  /** ≤ 200 mục; nhiều hơn thì `truncated`. */
  affected: RescheduleAffected[];
  truncated: boolean;
  skipped: RescheduleSkipped[];
  /** Múi giờ IANA mà server tính "ngày" — nguồn duy nhất, ⛔ không đoán theo máy. */
  timezone: string;
  previewToken: string;
}

/** Ngày mới của thẻ nguồn; `startDate` LUÔN gửi tường minh (xem `useReschedule`). */
export interface RescheduleChange {
  dueDate: string;
  startDate: string | null;
}

export interface RescheduleApplyPayload extends RescheduleChange {
  /** = `preview.source.version`. */
  expectedVersion: number;
  previewToken: string;
}

export interface RescheduleAppliedItem {
  taskId: string;
  newStartDate: string | null;
  newDueDate: string | null;
  version: number;
}

/** `200` (đồng bộ, ≤ 200 thẻ) — be.md §4. */
export interface RescheduleAppliedResult {
  kind: 'applied';
  rescheduleId: string;
  applied: RescheduleAppliedItem[];
  skipped: RescheduleSkipped[];
}

/** `202` (lô nền) — be.md §4. */
export interface RescheduleQueuedResult {
  kind: 'queued';
  batchId: string;
  affectedCount: number;
}

export type RescheduleApplyResult = RescheduleAppliedResult | RescheduleQueuedResult;

export type RescheduleBatchStatus = 'DONE' | 'FAILED' | 'PARTIAL' | 'QUEUED' | 'RUNNING';

/** `GET /reschedule-batches/:id` — be.md §4. */
export interface RescheduleBatchDto {
  id: string;
  status: RescheduleBatchStatus;
  affectedCount: number;
  appliedCount: number;
  conflictCount: number;
  /** ≤ 50 thẻ xung đột (bị sửa/đã DONE/đã xoá giữa lô). */
  conflicts: { taskId: string; title: string }[];
  createdAt: string;
  finishedAt: string | null;
}

// ── Gantt ────────────────────────────────────────────────────────────────────

export interface GanttTaskDto {
  id: string;
  title: string;
  /**
   * Cột hiện tại (BE thêm sau — be.md "Quyết định lệch" #14) để biểu đồ xếp hàng THEO CỘT. Tuỳ chọn: bản BE cũ không có thì hàng chỉ
   * sắp theo ngày (`sortGanttTasks`).
   */
  columnId?: string;
  columnKind: ColumnKind;
  startDate: string | null;
  dueDate: string | null;
  /** Chỉ có id — tên tra từ cache bảng. */
  assigneeIds: string[];
  blockedByCount: number;
  /** Số ngày dư trước thẻ sau (`null` = không có cạnh ra hợp lệ); âm = xung đột. */
  slackDays: number | null;
  isCritical: boolean;
  conflict: boolean;
}

export interface GanttEdgeDto {
  predecessorId: string;
  successorId: string;
  slackDays: number | null;
}

export interface GanttDto {
  timezone: string;
  from: string;
  to: string;
  /** Vượt `LIMITS.gantt.tasksMax` (2.000) thẻ — chỉ trả phần đầu. */
  truncated: boolean;
  tasks: GanttTaskDto[];
  edges: GanttEdgeDto[];
}

export interface GanttRange {
  from: string;
  to: string;
}

/** Sự kiện `board:rescheduled` (be.md §6, `v:1`). */
export interface BoardRescheduledPayload {
  boardId: string;
  rescheduleId?: string;
  batchId?: string;
  taskIds: string[];
  count: number;
  final: boolean;
}
