import {
  TASK_EVENTS,
  type TaskEventPayload,
  type TaskRescheduleBulkCompletedPayload,
  type TaskRescheduledPayload,
} from "../events/project-events";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { NotifyFn } from "./task-notification.handler";
import { RESCHEDULE_NOTIFICATION_TYPES } from "./task-notification.types";

export interface RescheduleNotificationDeps {
  tasks: ITaskRepository;
  directory: IProjectDirectory;
  notify: NotifyFn;
}

/** Số mã thẻ tối đa nhét vào `refs.taskIds` (còn lại chỉ cộng vào `count`). */
export const RESCHEDULE_REFS_TASK_IDS_MAX = 20;

/**
 * Sink của `task.events` (p4-04 be.md §7 "Consumer thông báo"): `task.rescheduled` → MỘT thông báo `TASK_RESCHEDULED` mỗi người
 * làm mỗi lần dời (gộp N thẻ của họ, loại người thực hiện); `task.reschedule-bulk.completed` → `TASK_RESCHEDULE_BATCH_DONE`
 * cho người yêu cầu. Idempotent: `Notification.dedupeKey` (`reschedule:<id>:<userId>` / `reschedule-batch:<id>`) kiểm tồn tại TRƯỚC
 * `notify()` (không idempotent với outbox `deliver`); người nhận phải còn là thành viên ACTIVE MEMBER+ (không GUEST).
 * `scope` là `WORKSPACE` (loại thông báo chưa có scope BOARD) — quyền đọc kiểm lại lúc giao bằng `workspace.board.read`.
 */
export class RescheduleNotificationHandler {
  constructor(private readonly d: RescheduleNotificationDeps) {}

  async handle(payload: TaskEventPayload): Promise<void> {
    switch (payload.event) {
      case TASK_EVENTS.RESCHEDULED:
        return this.rescheduled(payload);
      case TASK_EVENTS.RESCHEDULE_BULK_COMPLETED:
        return this.bulkCompleted(payload);
      default:
        return;
    }
  }

  private async rescheduled(p: TaskRescheduledPayload): Promise<void> {
    const byUser = new Map<string, string[]>();
    for (const item of p.items) {
      for (const userId of item.assigneeIds) {
        if (userId === p.actorId) continue;
        byUser.set(userId, [...(byUser.get(userId) ?? []), item.taskId]);
      }
    }
    if (byUser.size === 0) return;
    const active = await this.d.directory.activeMemberIds(p.workspaceId, [...byUser.keys()]);
    const source = await this.d.tasks.findById(p.sourceTaskId);

    for (const [userId, taskIds] of byUser) {
      if (!active.has(userId)) continue;
      const dedupeKey = `reschedule:${p.rescheduleId}:${userId}`;
      if (await this.d.directory.notificationExists(dedupeKey)) continue;
      await this.d.notify({
        type: RESCHEDULE_NOTIFICATION_TYPES.TASK_RESCHEDULED,
        actorId: p.actorId ?? undefined,
        scope: { type: "WORKSPACE", id: p.workspaceId },
        workspaceId: p.workspaceId,
        source: { type: "TASK_RESCHEDULE", id: `reschedule:${p.rescheduleId}` },
        refs: {
          taskId: p.sourceTaskId,
          boardId: p.boardId,
          workspaceId: p.workspaceId,
          sourceTaskId: p.sourceTaskId,
          ...(source && !source.deletedAt && { taskTitle: source.title }),
          rescheduleId: p.rescheduleId,
          taskIds: taskIds.slice(0, RESCHEDULE_REFS_TASK_IDS_MAX),
          count: taskIds.length,
        },
        recipients: [{ userId }],
        dedupeKey,
      });
    }
  }

  private async bulkCompleted(p: TaskRescheduleBulkCompletedPayload): Promise<void> {
    const dedupeKey = `reschedule-batch:${p.batchId}`;
    const active = await this.d.directory.activeMemberIds(p.workspaceId, [p.requestedBy]);
    if (!active.has(p.requestedBy) || (await this.d.directory.notificationExists(dedupeKey))) return;
    await this.d.notify({
      type: RESCHEDULE_NOTIFICATION_TYPES.TASK_RESCHEDULE_BATCH_DONE,
      scope: { type: "WORKSPACE", id: p.workspaceId },
      workspaceId: p.workspaceId,
      source: { type: "TASK_RESCHEDULE_BATCH", id: dedupeKey },
      refs: {
        boardId: p.boardId,
        workspaceId: p.workspaceId,
        batchId: p.batchId,
        status: p.status,
        appliedCount: p.appliedCount,
        conflictCount: p.conflictCount,
      },
      recipients: [{ userId: p.requestedBy }],
      dedupeKey,
    });
  }
}
