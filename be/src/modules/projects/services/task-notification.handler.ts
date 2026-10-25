import { LIMITS } from "../../../core/constants/limits";
import { PHASE3_NOTIFICATION_KINDS, PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { logger } from "../../../infrastructure/logger";
import type { NotifyInput } from "../../notifications/public";
import type { Task } from "../entities/task.interface";
import { TASK_EVENTS, type TaskAssignedPayload, type TaskCommentCreatedPayload, type TaskCommentUpdatedPayload, type TaskEventPayload } from "../events/project-events";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskCommentRepository } from "../repositories/task-comment.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { ITaskWatcherRepository } from "../repositories/task-watcher.repository.interface";
import { withWatchers } from "./task-watch-policy";

/** Ghi thông báo TRONG transaction (`withTransaction(tx => notify(tx, input))`) — bản giả trong test thu thập `input`. */
export type NotifyFn = (input: NotifyInput) => Promise<void>;

export interface TaskNotificationDeps {
  tasks: ITaskRepository;
  comments: ITaskCommentRepository;
  directory: IProjectDirectory;
  notify: NotifyFn;
  /** (p3-03 P1) Người theo dõi thẻ: thêm vào nhóm nhận `TASK_COMMENT`, bớt người đã tắt (`EXPLICIT_OFF`); `AUTO_ON` ghi khi được giao/bình luận/được nhắc. Vắng → như P0. */
  watchers?: ITaskWatcherRepository;
}

const T = PHASE3_NOTIFICATION_TYPES;

/**
 * Sink của `task.events` (p3-03 be.md §5 "Consumer thông báo"): `task.assigned`, `task.comment-created`,
 * `task.comment-updated` → `notify()` của p0-06 (engine ghi inbox + fan-out push, kiểm quyền LẠI lúc giao).
 *
 * Idempotent: `Notification.dedupeKey` dẫn xuất từ `jobId` (= dedupeKey outbox, duy nhất theo sự kiện) và kiểm tồn tại TRƯỚC
 * (`notify()` không idempotent với outbox `deliver`). Nhận thông báo: chỉ thành viên ACTIVE MEMBER+ hiện tại; hợp nhất "một người —
 * một thông báo" bằng cách trừ người được nhắc khỏi nhóm nhận `TASK_COMMENT` (mention thắng) rồi mới gọi `notify` (NT-01).
 *
 * ⏳ Chờ p1-07 (`be-p1-07`): (1) engine hiện chưa coi `TASK_ASSIGNED`/`TASK_DUE_SOON` là "cá nhân" khi người nhận đặt chế độ
 * workspace `MENTIONS` (`delivery.policy.ts` `MENTION_KINDS`/`PERSONAL_INBOX_FILTERS` chỉ có mention/calls/meetings); (2) deep link
 * thông báo `task.*` → màn chi tiết thẻ (routing map). Phần của module này (phát đúng sự kiện + gọi `notify`) đã đủ.
 */
export class TaskNotificationHandler {
  constructor(private readonly d: TaskNotificationDeps) {}

  async handle(payload: TaskEventPayload, jobId: string): Promise<void> {
    switch (payload.event) {
      case TASK_EVENTS.ASSIGNED:
        return this.assigned(payload, jobId);
      case TASK_EVENTS.COMMENT_CREATED:
        return this.commentCreated(payload, jobId);
      case TASK_EVENTS.COMMENT_UPDATED:
        return this.commentUpdated(payload, jobId);
      default:
        return;
    }
  }

  private async assigned(p: TaskAssignedPayload, jobId: string): Promise<void> {
    const task = await this.liveTask(p.taskId);
    if (!task) return;
    // Chỉ người VẪN đang là người làm (đã bị gỡ ngay sau đó thì thôi) và còn là thành viên hợp lệ.
    const recipients = await this.members(task, p.assigneeIds.filter((id) => id !== p.actorId && task.assigneeIds.includes(id)));
    await this.send(`notif.${jobId}`, recipients, {
      type: T.TASK_ASSIGNED,
      task,
      actorId: p.actorId,
      source: { type: "TASK", id: jobId },
    });
    await this.autoWatch(task.id, recipients);
  }

  private async commentCreated(p: TaskCommentCreatedPayload, jobId: string): Promise<void> {
    const task = await this.liveTask(p.taskId);
    if (!task || !(await this.liveComment(p.commentId))) return;
    const mentioned = await this.members(task, p.mentionIds.filter((id) => id !== p.actorId));
    const mentionedSet = new Set(mentioned);
    // (người làm ∪ người tạo ∪ người theo dõi, trừ người đã tắt) \ người được nhắc \ tác giả: một người chỉ nhận MỘT thông báo, ưu tiên MENTION.
    const interested = withWatchers([...new Set([...p.assigneeIds, p.createdBy])], await this.watchRows(task.id));
    const watchers = await this.members(task, interested.filter((id) => id !== p.actorId && !mentionedSet.has(id)));
    const source = { type: "TASK_COMMENT", id: `comment:${p.commentId}` };
    await this.send(`notif.${jobId}.mention`, mentioned, { type: T.TASK_COMMENT_MENTION, task, actorId: p.actorId, source, commentId: p.commentId, kind: PHASE3_NOTIFICATION_KINDS.TASK_COMMENT_MENTION });
    await this.send(`notif.${jobId}.comment`, watchers, { type: T.TASK_COMMENT, task, actorId: p.actorId, source, commentId: p.commentId, kind: PHASE3_NOTIFICATION_KINDS.TASK_COMMENT });
    await this.autoWatch(task.id, [...(p.actorId ? [p.actorId] : []), ...mentioned]);
  }

  /** Sửa bình luận: chỉ người MỚI được nhắc (payload đã lọc) — dùng `source.id` riêng theo phiên bản để không hợp nhất với lần đầu. */
  private async commentUpdated(p: TaskCommentUpdatedPayload, jobId: string): Promise<void> {
    const task = await this.liveTask(p.taskId);
    if (!task || !(await this.liveComment(p.commentId))) return;
    const mentioned = await this.members(task, p.mentionIds.filter((id) => id !== p.actorId));
    await this.send(`notif.${jobId}.mention`, mentioned, {
      type: T.TASK_COMMENT_MENTION,
      task,
      actorId: p.actorId,
      source: { type: "TASK_COMMENT", id: `comment:${p.commentId}:v${p.commentVersion}` },
      commentId: p.commentId,
      kind: PHASE3_NOTIFICATION_KINDS.TASK_COMMENT_MENTION,
    });
  }

  private async watchRows(taskId: string) {
    return this.d.watchers ? this.d.watchers.listByTask(taskId, LIMITS.task.watchersListMax) : [];
  }

  /** Tương tác (được giao, bình luận, được nhắc) ⇒ tự theo dõi thẻ. Chỉ tạo hàng cho người CHƯA có lựa chọn; lỗi không làm hỏng thông báo. */
  private async autoWatch(taskId: string, userIds: string[]): Promise<void> {
    if (!this.d.watchers || userIds.length === 0) return;
    try {
      await this.d.watchers.ensureAuto(taskId, userIds);
    } catch (err) {
      logger.warn("[projects] không ghi được theo dõi tự động của thẻ", { taskId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async liveTask(taskId: string): Promise<Task | null> {
    const task = await this.d.tasks.findById(taskId);
    return task && !task.deletedAt ? task : null;
  }

  private async liveComment(commentId: string): Promise<boolean> {
    const comment = await this.d.comments.findById(commentId);
    return comment !== null && comment.deletedAt === null;
  }

  private async members(task: Task, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const active = await this.d.directory.activeMemberIds(task.workspaceId, ids);
    return ids.filter((id) => active.has(id));
  }

  private async send(
    dedupeKey: string,
    recipientIds: string[],
    o: { type: string; task: Task; actorId: string | null; source: { type: string; id: string }; commentId?: string; kind?: string }
  ): Promise<void> {
    if (recipientIds.length === 0 || (await this.d.directory.notificationExists(dedupeKey))) return;
    await this.d.notify({
      type: o.type,
      actorId: o.actorId ?? undefined,
      scope: { type: "WORKSPACE", id: o.task.workspaceId },
      workspaceId: o.task.workspaceId,
      source: o.source,
      // `refs` chỉ chứa id + tiêu đề thẻ (mẫu push chỉ dùng tiêu đề khi người nhận bật xem trước) — KHÔNG chứa nội dung bình luận.
      refs: { taskId: o.task.id, boardId: o.task.boardId, workspaceId: o.task.workspaceId, taskTitle: o.task.title, ...(o.commentId && { commentId: o.commentId }) },
      recipients: recipientIds.map((userId) => ({ userId, ...(o.kind && { kind: o.kind }) })),
      dedupeKey,
    });
  }
}
