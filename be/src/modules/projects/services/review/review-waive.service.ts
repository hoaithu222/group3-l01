import { ScopeNotFoundError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import type { WaiveReviewDto } from "../../dtos";
import type { TxContext } from "../../repositories/unit-of-work";
import { noOpenRoundError } from "./review-errors";
import { roundClosedRow } from "./review-events";
import { presentRound, userIdsOf, type ReviewRoundDto } from "./review.presenter";
import type { ReviewPublisher } from "./review-publisher";
import { cancelRemindersBestEffort, type IReviewReminders } from "./review-reminders";
import { nowOf, type ReviewDeps } from "./review.deps";

/**
 * Miễn chấm (p4-05 be.md §5.5): OWNER/ADMIN (`workspace.board.edit`) bỏ qua lượt đang mở kèm LÝ DO (10–500 ký tự) — lượt `WAIVED`, review chờ
 * `CANCELLED (MANUAL)`, `reviewState = APPROVED` (thẻ được kéo sang DONE), audit `task-review.waive`, báo người làm. Lượt miễn/tự duyệt KHÔNG có điểm
 * review nên thành phần review của người làm tính N/A ở p4-06.
 */
export class ReviewWaiveService {
  constructor(
    private readonly d: ReviewDeps,
    private readonly publisher: ReviewPublisher,
    private readonly reminders?: IReviewReminders
  ) {}

  async waive(user: AuthUser, taskId: string, dto: WaiveReviewDto): Promise<ReviewRoundDto> {
    const { task: seen } = await this.d.access.task(user, taskId, "workspace.board.edit");
    const out = await this.d.runner.run(seen.boardId, (tx) => this.waiveInTx(tx, user.id, taskId, dto.reason));

    await this.d.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "task-review.waive",
      targetType: "TaskReviewRound",
      targetId: out.round.id,
      workspaceId: seen.workspaceId,
      reason: dto.reason,
      metadata: { taskId, round: out.round.round },
    });
    await this.publisher.publish(taskId, { actorId: user.id, activities: out.activities });
    await cancelRemindersBestEffort(this.reminders, this.d.defaults, out.cancelledIds);

    const reviews = await this.d.reviews.listByRound(out.round.id);
    const users = await this.d.directory.userSummaries(userIdsOf([out.round], reviews));
    return presentRound(out.round, reviews, users, { userId: user.id, isAdmin: true, isAssignee: false });
  }

  private async waiveInTx(tx: TxContext, actorId: string, taskId: string, reason: string) {
    const now = nowOf(this.d);
    const round = await this.d.rounds.findOpen(taskId, tx);
    if (!round) throw noOpenRoundError();
    const task = await this.d.tasks.findById(taskId, tx);
    if (!task || task.deletedAt) throw new ScopeNotFoundError();

    const cancelled = await this.d.reviews.cancelPendingOfRound(round.id, "MANUAL", tx);
    const closed = await this.d.rounds.updateCas(round.id, round.version, { status: "WAIVED", closedAt: now, closeReason: "WAIVED", waivedBy: actorId, waiveReason: reason }, tx);
    if (!closed) throw noOpenRoundError();
    await this.d.tasks.setReviewState(taskId, "APPROVED", tx);
    const activity = await this.d.activity.record(tx, {
      taskId,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId,
      type: "REVIEW_WAIVED",
      before: null,
      after: { roundId: round.id },
    });
    await this.d.outbox.add(tx, roundClosedRow(closed, "WAIVED", task.assigneeIds, actorId));
    return { round: closed, activities: [activity], cancelledIds: cancelled.map((r) => r.id) };
  }
}
