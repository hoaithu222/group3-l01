import { LIMITS } from "../../../core/constants/limits";
import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { TASK_EVENTS, type TaskEventPayload } from "../events/project-events";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { ITaskWatcherRepository } from "../repositories/task-watcher.repository.interface";
import type { NotifyFn } from "./task-notification.handler";
import { withWatchers } from "./task-watch-policy";

export interface DueReminderJobData {
  taskId: string;
  dueVersion: number;
}

/**
 * `jobId` tất định theo `dueVersion`: đổi hạn ⇒ job cũ bị huỷ theo id rồi tạo job mới. Chuỗi gốc có 3 dấu `:` nên MỌI nơi dùng
 * (tạo lẫn huỷ) phải qua `toSafeJobId` — BullMQ ném "Custom Id cannot contain :" (xem `delayed-jobs.ts`).
 */
export const dueReminderJobId = (taskId: string, dueVersion: number): string => `task.due-reminder:task:${taskId}:d${dueVersion}`;

/** Cổng hàng đợi hẹn giờ — bản BullMQ thật ở `task-due-reminder.queue.ts` (tách để unit test không kéo hạ tầng queue), bản giả trong test (đọc `jobs` để khẳng định "chỉ một job", PM2-18). */
export interface IReminderQueue {
  schedule(jobId: string, data: DueReminderJobData, runAt: Date): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export interface TaskDueReminderDeps {
  tasks: ITaskRepository;
  directory: IProjectDirectory;
  queue: IReminderQueue;
  notify: NotifyFn;
  /** (p3-03 P1) Người theo dõi thẻ cũng được nhắc hạn (trừ người đã tắt). Vắng → như P0. */
  watchers?: ITaskWatcherRepository;
  now?: () => Date;
}

export type DueReminderOutcome = "sent" | "skipped";

/**
 * Nhắc hạn (p3-03 be.md §5): job hẹn giờ `task.due-reminder` chạy `dueReminderHoursBefore` giờ trước hạn.
 *  · `handleEvent` là SINK của `task.events` (outbox → bền qua crash): `due-changed` huỷ job phiên bản cũ + hẹn job mới;
 *    `completed`/`deleted` huỷ; `reopened`/`restored` hẹn lại.
 *  · `process` (processor của job) LUÔN kiểm lại: thẻ còn sống, chưa hoàn thành, còn hạn, `dueVersion` khớp — nên job cũ lọt lưới
 *    (huỷ hụt vì đua) cũng không gửi nhầm. Idempotent theo `Notification.dedupeKey`.
 */
export class TaskDueReminderService {
  constructor(private readonly d: TaskDueReminderDeps) {}

  private now(): Date {
    return this.d.now ? this.d.now() : new Date();
  }

  async handleEvent(p: TaskEventPayload): Promise<void> {
    switch (p.event) {
      case TASK_EVENTS.DUE_CHANGED:
        if (p.dueVersion > 1) await this.d.queue.cancel(dueReminderJobId(p.taskId, p.dueVersion - 1));
        await this.schedule(p.taskId, p.newDue ? new Date(p.newDue) : null, p.dueVersion);
        return;
      case TASK_EVENTS.COMPLETED:
      case TASK_EVENTS.DELETED: {
        const task = await this.d.tasks.findById(p.taskId);
        if (task) await this.d.queue.cancel(dueReminderJobId(task.id, task.dueVersion));
        return;
      }
      case TASK_EVENTS.REOPENED:
      case TASK_EVENTS.RESTORED: {
        const task = await this.d.tasks.findById(p.taskId);
        if (task && !task.deletedAt && !task.completedAt) await this.schedule(task.id, task.dueDate, task.dueVersion);
        return;
      }
      default:
        return;
    }
  }

  private async schedule(taskId: string, dueDate: Date | null, dueVersion: number): Promise<void> {
    if (!dueDate) return;
    const runAt = new Date(dueDate.getTime() - LIMITS.task.dueReminderHoursBefore * 3_600_000);
    if (runAt.getTime() <= this.now().getTime()) return; // hạn quá gần: không còn "trước 24 giờ" để nhắc
    await this.d.queue.schedule(dueReminderJobId(taskId, dueVersion), { taskId, dueVersion }, runAt);
  }

  async process(data: DueReminderJobData): Promise<DueReminderOutcome> {
    const task = await this.d.tasks.findById(data.taskId);
    if (!task || task.deletedAt || task.completedAt || !task.dueDate || task.dueVersion !== data.dueVersion) return "skipped";

    // Người làm; thẻ chưa giao ai → người tạo; cộng người theo dõi, trừ người đã tắt. Chỉ thành viên ACTIVE MEMBER+ hiện tại.
    const rows = this.d.watchers ? await this.d.watchers.listByTask(task.id, LIMITS.task.watchersListMax) : [];
    const candidates = withWatchers(task.assigneeIds.length > 0 ? task.assigneeIds : [task.createdBy], rows);
    const active = await this.d.directory.activeMemberIds(task.workspaceId, candidates);
    const recipients = candidates.filter((id) => active.has(id));
    const dedupeKey = `task.due-soon:task:${task.id}:d${task.dueVersion}`;
    if (recipients.length === 0 || (await this.d.directory.notificationExists(dedupeKey))) return "skipped";

    await this.d.notify({
      type: PHASE3_NOTIFICATION_TYPES.TASK_DUE_SOON,
      scope: { type: "WORKSPACE", id: task.workspaceId },
      workspaceId: task.workspaceId,
      source: { type: "TASK", id: `due:${task.id}:d${task.dueVersion}` },
      refs: { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, taskTitle: task.title, dueDate: task.dueDate.toISOString() },
      recipients: recipients.map((userId) => ({ userId })),
      dedupeKey,
    });
    return "sent";
  }
}
