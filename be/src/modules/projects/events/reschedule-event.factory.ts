import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { ReschedulePlanItem } from "../entities/reschedule.interface";
import {
  RESCHEDULE_BULK_JOB,
  RESCHEDULE_BULK_QUEUE,
  TASK_EVENTS,
  taskEventKeys,
  toOutboxEvent,
  type RescheduleBulkFinalStatus,
} from "./project-events";

interface Where {
  boardId: string;
  workspaceId: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * Outbox `task.rescheduled` (→ `notifications/task.events` → sink thông báo): MỘT hàng cho cả lần dời (`rescheduleId` = id lệnh
 * hoặc id lô nền). `items` chỉ gồm thẻ SAU đã dời (không gồm nguồn) — consumer gộp theo người làm.
 */
export function rescheduledOutbox(
  w: Where & { rescheduleId: string; batchId: string | null; sourceTaskId: string; actorId: string; items: ReschedulePlanItem[] }
): OutboxEventInput {
  return toOutboxEvent(
    {
      event: TASK_EVENTS.RESCHEDULED,
      taskId: w.sourceTaskId,
      boardId: w.boardId,
      workspaceId: w.workspaceId,
      actorId: w.actorId,
      rescheduleId: w.rescheduleId,
      batchId: w.batchId,
      sourceTaskId: w.sourceTaskId,
      items: w.items.map((i) => ({ taskId: i.taskId, assigneeIds: i.assigneeIds, oldDueDate: iso(i.oldDueDate), newDueDate: iso(i.newDueDate) })),
    },
    taskEventKeys.rescheduled(w.rescheduleId)
  );
}

/** Outbox `task.reschedule-bulk.completed` — thông báo người yêu cầu khi lô nền kết thúc (kể cả `FAILED`). */
export function rescheduleBulkCompletedOutbox(
  w: Where & {
    batchId: string;
    requestedBy: string;
    sourceTaskId: string;
    status: RescheduleBulkFinalStatus;
    appliedCount: number;
    conflictCount: number;
  }
): OutboxEventInput {
  return toOutboxEvent(
    {
      event: TASK_EVENTS.RESCHEDULE_BULK_COMPLETED,
      taskId: w.sourceTaskId,
      boardId: w.boardId,
      workspaceId: w.workspaceId,
      actorId: w.requestedBy,
      batchId: w.batchId,
      requestedBy: w.requestedBy,
      sourceTaskId: w.sourceTaskId,
      status: w.status,
      appliedCount: w.appliedCount,
      conflictCount: w.conflictCount,
    },
    taskEventKeys.rescheduleBulkCompleted(w.batchId)
  );
}

/** Outbox kích job nền `reports/task.reschedule-bulk` (`dedupeKey` `task.reschedule-bulk:batch:<id>` — relay đổi `:` → `_` thành jobId BullMQ). */
export function rescheduleBulkJobOutbox(w: Where & { batchId: string }): OutboxEventInput {
  return {
    type: RESCHEDULE_BULK_JOB,
    aggregateType: "RescheduleBatch",
    aggregateId: w.batchId,
    queue: RESCHEDULE_BULK_QUEUE,
    jobName: RESCHEDULE_BULK_JOB,
    dedupeKey: taskEventKeys.rescheduleBulk(w.batchId),
    payload: { batchId: w.batchId, boardId: w.boardId, workspaceId: w.workspaceId },
  };
}
