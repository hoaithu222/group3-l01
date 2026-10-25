import type { NotifyInput } from "../../../notifications/public";
import { DOMAIN_EVENTS } from "../../../../shared/events/domain-events";
import { logger } from "../../../../infrastructure/logger";
import type { Task } from "../../entities/task.interface";
import type { IProjectDirectory } from "../../repositories/project-directory.interface";
import type { ITaskRepository } from "../../repositories/task.repository.interface";
import type { ITaskReviewRepository, ITaskReviewRoundRepository } from "../../repositories/task-review.repository.interface";
import type { NotifyFn } from "../task-notification.handler";
import type { IReviewDefaults } from "./review-defaults";
import type { ReviewEventPayload } from "./review-events";
import { REVIEW_NOTIFICATION_TYPES as T, type ReviewNotificationType } from "./review-notification.types";
import type { ReviewPublisher } from "./review-publisher";
import type { IReviewReminders, ReviewReminderJobData } from "./review-reminders";

export interface ReviewNotificationDeps {
  rounds: ITaskReviewRoundRepository;
  reviews: ITaskReviewRepository;
  tasks: ITaskRepository;
  directory: IProjectDirectory;
  notify: NotifyFn;
  publisher: Pick<ReviewPublisher, "publish">;
  reminders: IReviewReminders;
  defaults: IReviewDefaults;
  now?: () => Date;
}

const HOUR_MS = 3_600_000;

/**
 * Consumer của outbox `review.assigned|round-closed|cancelled|shortage` (job `notifications/review.events`, p4-05 be.md §7) và của job hẹn giờ
 * `review.reminder`: chuyển thành `notify()` (engine p0-06 ghi hộp thư + push, kiểm quyền LẠI lúc giao), hẹn nhắc 24/72 giờ và phát realtime.
 * IDEMPOTENT: `dedupeKey` thông báo dẫn xuất từ `jobId`/review (`notify()` không ghi thêm khi trùng); người nhận luôn được kiểm còn đủ điều kiện
 * LÚC GỬI (đã rời nhóm/không còn PENDING → bỏ). Không bao giờ mang điểm/nhận xét.
 */
export class ReviewNotificationHandler {
  constructor(private readonly d: ReviewNotificationDeps) {}

  private now(): Date {
    return this.d.now ? this.d.now() : new Date();
  }

  async handle(payload: ReviewEventPayload, jobId: string): Promise<void> {
    const task = await this.d.tasks.findById(payload.taskId);
    if (!task || task.deletedAt) return;
    switch (payload.event) {
      case DOMAIN_EVENTS.REVIEW_ASSIGNED:
        await this.assigned(payload, task, jobId);
        break;
      case DOMAIN_EVENTS.REVIEW_ROUND_CLOSED:
        await this.roundClosed(payload, task, jobId);
        break;
      case DOMAIN_EVENTS.REVIEW_CANCELLED:
        await this.cancelled(payload, task, jobId);
        break;
      case DOMAIN_EVENTS.REVIEW_SHORTAGE:
        await this.shortage(payload, task, jobId);
        break;
    }
    await this.d.publisher.publish(task.id);
  }

  private async assigned(p: Extract<ReviewEventPayload, { event: "review.assigned" }>, task: Task, jobId: string): Promise<void> {
    const rows = await this.d.reviews.listByRound(p.roundId);
    const pending = new Map(rows.filter((r) => r.status === "PENDING").map((r) => [r.id, r]));
    const targets = p.reviews.flatMap((r) => (pending.has(r.reviewId) ? [pending.get(r.reviewId)!] : []));
    if (targets.length === 0) return;
    const active = await this.d.directory.activeReviewerIds(p.workspaceId, targets.map((r) => r.reviewerId));
    const live = targets.filter((r) => active.has(r.reviewerId));
    await this.send(T.REQUESTED, task, p.roundId, `notif.${jobId}`, `round:${p.roundId}:${jobId}`, live.map((r) => r.reviewerId));

    const { reminderHours } = await this.d.defaults.load();
    const now = this.now().getTime();
    for (const review of live) {
      for (const hours of reminderHours) {
        const runAt = new Date(review.assignedAt.getTime() + hours * HOUR_MS);
        if (runAt.getTime() > now) await this.d.reminders.schedule(review.id, hours, runAt);
      }
    }
  }

  private async roundClosed(p: Extract<ReviewEventPayload, { event: "review.round-closed" }>, task: Task, jobId: string): Promise<void> {
    const type = p.status === "CHANGES_REQUESTED" ? T.CHANGES_REQUESTED : p.status === "APPROVED" ? T.APPROVED : T.WAIVED;
    const active = await this.d.directory.activeMemberIds(p.workspaceId, p.assigneeIds);
    const recipients = p.assigneeIds.filter((id) => active.has(id) && id !== p.actorId);
    await this.send(type, task, p.roundId, `notif.${jobId}`, `round:${p.roundId}:${p.status}`, recipients, { autoApproved: p.autoApproved });
  }

  private async cancelled(p: Extract<ReviewEventPayload, { event: "review.cancelled" }>, task: Task, jobId: string): Promise<void> {
    const active = await this.d.directory.activeReviewerIds(p.workspaceId, p.reviews.map((r) => r.reviewerId));
    const recipients = p.reviews.map((r) => r.reviewerId).filter((id) => active.has(id));
    await this.send(T.CANCELLED, task, p.roundId, `notif.${jobId}`, `round:${p.roundId}:cancelled:${jobId}`, recipients);
  }

  private async shortage(p: Extract<ReviewEventPayload, { event: "review.shortage" }>, task: Task, jobId: string): Promise<void> {
    const admins = await this.d.directory.listAdminIds(p.workspaceId);
    await this.send(T.SHORTAGE, task, p.roundId, `notif.${jobId}`, `round:${p.roundId}:shortage:${jobId}`, admins, {
      requiredReviews: p.requiredReviews,
      configuredReviews: p.configuredReviews,
      autoApproved: p.autoApproved,
    });
  }

  /**
   * Job hẹn giờ `review.reminder`: nhắc người chấm nếu review VẪN đang chờ trong lượt còn mở. Kiểm lại mọi thứ lúc chạy (huỷ hụt vì đua vẫn không
   * gửi nhầm). Trả `sent`/`skipped`.
   */
  async remind(data: ReviewReminderJobData): Promise<"sent" | "skipped"> {
    const review = await this.d.reviews.findById(data.reviewId);
    if (!review || review.status !== "PENDING") return "skipped";
    const [round, task] = await Promise.all([this.d.rounds.findById(review.roundId), this.d.tasks.findById(review.taskId)]);
    if (!round || round.status !== "OPEN" || !task || task.deletedAt || task.assigneeIds.includes(review.reviewerId)) return "skipped";
    const active = await this.d.directory.activeReviewerIds(review.workspaceId, [review.reviewerId]);
    if (!active.has(review.reviewerId)) return "skipped";
    await this.send(T.REMINDER, task, round.id, `review.reminder:review:${review.id}:h${data.hours}`, `review:${review.id}:h${data.hours}`, [review.reviewerId]);
    return "sent";
  }

  private async send(
    type: ReviewNotificationType,
    task: Task,
    roundId: string,
    dedupeKey: string,
    sourceId: string,
    userIds: string[],
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    const recipients = [...new Set(userIds)].map((userId) => ({ userId }));
    if (recipients.length === 0) return;
    const input: NotifyInput = {
      type,
      scope: { type: "WORKSPACE", id: task.workspaceId },
      workspaceId: task.workspaceId,
      source: { type: "TASK_REVIEW", id: sourceId },
      refs: { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, roundId, taskTitle: task.title, ...extra },
      recipients,
      dedupeKey,
    };
    try {
      await this.d.notify(input);
    } catch (err) {
      logger.warn("[review] không ghi được thông báo (job sẽ thử lại)", { type, taskId: task.id, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
