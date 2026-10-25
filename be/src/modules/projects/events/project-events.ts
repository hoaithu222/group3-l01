/**
 * Tên + schema payload sự kiện miền của phân hệ Dự án (ghi qua outbox trong CÙNG transaction với nghiệp vụ).
 * KHÔNG chứa tiêu đề/mô tả thẻ (dữ liệu nhóm; consumer cần thì đọc lại theo `taskId`).
 *
 * Định tuyến: mọi sự kiện đi vào queue `notifications`, job `task.events` (một processor, theo mẫu
 * `channel.events`/`workspace.events`); processor chuyển cho các "sink" đã đăng ký (`task-event-sinks.ts`) —
 * p4-03 (XP), p4-04 (phụ thuộc), p4-06 (đóng góp), p6-06 (kỹ năng), p3-03 (thông báo/nhắc hạn) đăng ký sink
 * thay vì mỗi nơi đòi một hàng outbox riêng (dedupeKey outbox là unique nên không thể ghi cùng sự kiện nhiều lần).
 */
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";

export const TASK_EVENTS = {
  CREATED: "task.created",
  ASSIGNED: "task.assigned",
  DUE_CHANGED: "task.due-changed",
  COMPLETED: "task.completed",
  REOPENED: "task.reopened",
  /** p3-03 (xoá/khôi phục thẻ) — tên cố định sớm ở p3-02 để consumer p4-04 khai đúng. */
  DELETED: "task.deleted",
  RESTORED: "task.restored",
  /** p3-03: bình luận mới / sửa bình luận có nhắc tên người mới. Đi cùng job `task.events` như các sự kiện trên. */
  COMMENT_CREATED: "task.comment-created",
  COMMENT_UPDATED: "task.comment-updated",
  /** p4-04: một lần dời lịch theo phụ thuộc đã áp (đồng bộ hoặc cuối lô nền) — `taskId` = thẻ nguồn. */
  RESCHEDULED: "task.rescheduled",
  /** p4-04: lô dời lịch nền kết thúc (`DONE`/`PARTIAL`/`FAILED`) — thông báo người yêu cầu. */
  RESCHEDULE_BULK_COMPLETED: "task.reschedule-bulk.completed",
} as const;
export type TaskEventName = (typeof TASK_EVENTS)[keyof typeof TASK_EVENTS];

export const TASK_EVENT_QUEUE = "notifications" as const;
export const TASK_EVENT_JOB = "task.events" as const;

interface TaskEventBase {
  event: TaskEventName;
  taskId: string;
  boardId: string;
  workspaceId: string;
  /** `null` = hệ thống. */
  actorId: string | null;
}

export interface TaskCreatedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.CREATED;
  columnId: string;
  createdBy: string;
  assigneeIds: string[];
  dueDate: string | null;
  createdAt: string;
}

/** `assigneeIds` = người MỚI được giao (đã loại người thực hiện). */
export interface TaskAssignedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.ASSIGNED;
  assigneeIds: string[];
}

export interface TaskDueChangedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.DUE_CHANGED;
  oldDue: string | null;
  newDue: string | null;
  dueVersion: number;
}

/** Metadata review (p4-05 ghi đè qua `TaskMovePolicy`); Phase 3 luôn `{ enabled: false, approved: false }`. */
export interface TaskReviewMeta {
  enabled: boolean;
  approved: boolean;
  [extra: string]: unknown;
}

export interface TaskCompletedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.COMPLETED;
  /** Người làm TẠI LÚC hoàn thành (chia điểm/XP theo danh sách này). */
  assigneeIds: string[];
  storyPoints: number | null;
  dueDate: string | null;
  completedAt: string;
  /** Có hạn chót và `completedAt <= dueDate`. Không có hạn → `false`. */
  onTime: boolean;
  /** Lần hoàn thành thứ `n` (khớp hậu tố `c<n>` của dedupeKey). */
  completionCount: number;
  /** Cho p4-03 chống farm XP (`completedAt − taskCreatedAt < minTaskAgeSec`). */
  taskCreatedAt: string;
  /** Tên nhãn GỐC của thẻ lúc hoàn thành (p6-06 tự chuẩn hoá) — do p3-02 cấp. */
  labelNames: string[];
  review: TaskReviewMeta;
}

export interface TaskReopenedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.REOPENED;
  assigneeIds: string[];
  /** Lần hoàn thành bị mở lại (không đổi). */
  completionCount: number;
  reopenedAt: string;
}

/** `columnId` = cột lúc xoá (`deleted`) / cột đã khôi phục về (`restored`). */
export interface TaskDeletedRestoredPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.DELETED | typeof TASK_EVENTS.RESTORED;
  columnId: string;
  [extra: string]: unknown;
}

/** Không chứa nội dung bình luận (consumer đọc lại theo `commentId`). `mentionIds` đã loại tác giả. */
export interface TaskCommentCreatedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.COMMENT_CREATED;
  commentId: string;
  mentionIds: string[];
  /** Người làm của thẻ TẠI LÚC bình luận (consumer trừ tác giả và người đã được nhắc). */
  assigneeIds: string[];
  createdBy: string;
}

/** Sửa bình luận: chỉ chứa người MỚI được nhắc trong lần sửa (người đã được nhắc trước đó không báo lại). */
export interface TaskCommentUpdatedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.COMMENT_UPDATED;
  commentId: string;
  commentVersion: number;
  mentionIds: string[];
}

/**
 * `taskId` = thẻ NGUỒN (đổi hạn thẻ này kéo các thẻ sau). `items` = các thẻ SAU đã được dời (không gồm nguồn); người làm lấy tại
 * lúc lập kế hoạch để gộp "một thông báo mỗi người mỗi lần dời". `rescheduleId` = id lệnh (đồng bộ) hoặc id lô (`batchId`).
 */
export interface TaskRescheduledPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.RESCHEDULED;
  rescheduleId: string;
  batchId: string | null;
  sourceTaskId: string;
  items: { taskId: string; assigneeIds: string[]; oldDueDate: string | null; newDueDate: string | null }[];
}

export type RescheduleBulkFinalStatus = "DONE" | "PARTIAL" | "FAILED";

/** `actorId` = `requestedBy` (người bấm "Dời lịch"). */
export interface TaskRescheduleBulkCompletedPayload extends TaskEventBase {
  event: typeof TASK_EVENTS.RESCHEDULE_BULK_COMPLETED;
  batchId: string;
  requestedBy: string;
  sourceTaskId: string;
  status: RescheduleBulkFinalStatus;
  appliedCount: number;
  conflictCount: number;
}

export type TaskEventPayload =
  | TaskCreatedPayload
  | TaskAssignedPayload
  | TaskDueChangedPayload
  | TaskCompletedPayload
  | TaskReopenedPayload
  | TaskDeletedRestoredPayload
  | TaskCommentCreatedPayload
  | TaskCommentUpdatedPayload
  | TaskRescheduledPayload
  | TaskRescheduleBulkCompletedPayload;

export const taskEventKeys = {
  created: (taskId: string) => `task.created:task:${taskId}`,
  assigned: (taskId: string, suffix: string) => `task.assigned:task:${taskId}:${suffix}`,
  dueChanged: (taskId: string, dueVersion: number) => `task.due-changed:task:${taskId}:d${dueVersion}`,
  completed: (taskId: string, completionCount: number) => `task.completed:task:${taskId}:c${completionCount}`,
  reopened: (taskId: string, completionCount: number) => `task.reopened:task:${taskId}:c${completionCount}`,
  deleted: (taskId: string, version: number) => `task.deleted:task:${taskId}:v${version}`,
  restored: (taskId: string, version: number) => `task.restored:task:${taskId}:v${version}`,
  commentCreated: (commentId: string) => `task.comment-created:comment:${commentId}`,
  commentUpdated: (commentId: string, commentVersion: number) => `task.comment-updated:comment:${commentId}:v${commentVersion}`,
  rescheduled: (rescheduleId: string) => `task.rescheduled:op:${rescheduleId}`,
  rescheduleBulkCompleted: (batchId: string) => `task.reschedule-bulk.completed:batch:${batchId}`,
  /** Job nền áp lô dời lịch (queue `reports`) — không phải sự kiện `task.events`. */
  rescheduleBulk: (batchId: string) => `task.reschedule-bulk:batch:${batchId}`,
} as const;

export const RESCHEDULE_BULK_QUEUE = "reports" as const;
export const RESCHEDULE_BULK_JOB = "task.reschedule-bulk" as const;

/** Hàng outbox chuẩn cho một sự kiện Task. */
export function toOutboxEvent(payload: TaskEventPayload, dedupeKey: string): OutboxEventInput {
  return {
    type: payload.event,
    aggregateType: "Task",
    aggregateId: payload.taskId,
    queue: TASK_EVENT_QUEUE,
    jobName: TASK_EVENT_JOB,
    dedupeKey,
    payload: payload as unknown as Record<string, unknown>,
  };
}
