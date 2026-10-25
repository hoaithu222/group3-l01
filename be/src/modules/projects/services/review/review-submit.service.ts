import { ScopeNotFoundError, VersionConflictError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import type { Board } from "../../entities/board.interface";
import type { TaskReview, TaskReviewRound } from "../../entities/task-review.interface";
import type { Task, TaskActivity } from "../../entities/task.interface";
import type { SubmitReviewDto } from "../../dtos";
import type { TxContext } from "../../repositories/unit-of-work";
import { betweenOrRepair } from "../safe-between";
import { needsRebalance } from "../task-position";
import { computeScore } from "./review-score";
import { feedbackRequiredError, forbiddenError, reviewClosedError, selfReviewError } from "./review-errors";
import { roundClosedRow, submittedRows } from "./review-events";
import { presentReview, presentRound, userIdsOf, type ReviewRoundDto, type TaskReviewDto } from "./review.presenter";
import { canSeeResults, visibilityOf } from "./review-visibility";
import { cancelRemindersBestEffort, type IReviewReminders } from "./review-reminders";
import type { ReviewPublisher } from "./review-publisher";
import type { ReviewRoundService } from "./review-round.service";
import type { IReviewAutoComplete } from "./review-auto-complete";
import { nowOf, type ReviewDeps } from "./review.deps";

export interface SubmitReviewResult {
  review: TaskReviewDto;
  round: ReviewRoundDto;
  task: { id: string; reviewState: Task["reviewState"]; columnId: string; columnKind: Task["columnKind"]; position: string; version: number };
}

interface Closing {
  round: TaskReviewRound;
  task: Task;
  reviewState: Task["reviewState"];
  moved: boolean;
  activities: TaskActivity[];
}

interface SubmitOutcome extends Closing {
  review: TaskReview;
  before: Task;
}

/**
 * Nộp chấm (p4-05 be.md §5.3) — MỘT transaction qua `BoardWriteRunner` (Yêu cầu sửa đưa thẻ về IN_PROGRESS = đổi thứ tự cột):
 * CAS theo `review.version` + trạng thái PENDING → tính điểm (`REVIEW_002`) → ghi review → Duyệt: `approvedCount + 1`, đủ số lượt ⇒ lượt APPROVED;
 * Yêu cầu sửa: lượt CHANGES_REQUESTED, review chờ còn lại CANCELLED, thẻ về cột IN_PROGRESS đầu tiên (không có ⇒ giữ cột, trạng thái vẫn đổi) →
 * activity (KHÔNG lưu điểm) → outbox `review.submitted` (XP + đóng góp) và `review.round-closed`. Sau commit: realtime + huỷ job nhắc.
 * P1 `autoCompleteOnApproval`: lượt vừa đóng APPROVED ⇒ (cùng transaction) hệ thống chuyển thẻ sang DONE qua `move` (`ReviewAutoComplete`).
 */
export class ReviewSubmitService {
  constructor(
    private readonly d: ReviewDeps,
    private readonly rounds: ReviewRoundService,
    private readonly publisher: ReviewPublisher,
    private readonly reminders?: IReviewReminders,
    private readonly autoComplete?: IReviewAutoComplete
  ) {}

  async submit(user: AuthUser, reviewId: string, dto: SubmitReviewDto): Promise<SubmitReviewResult> {
    const seen = await this.d.reviews.findById(reviewId);
    if (!seen) throw new ScopeNotFoundError();
    // Không thấy bảng (GUEST/người ngoài/đã rời nhóm) → 404 trung tính; bảng/nhóm lưu trữ (thiếu quyền ghi) → 403.
    const { access } = await this.d.access.board(user, seen.boardId, "workspace.task.update");
    if (seen.reviewerId !== user.id) throw forbiddenError();
    // Nhận xét đã trim (Zod trim ở route, nhưng service không được tin): rỗng/khoảng trắng ≡ không có.
    const feedback = dto.feedback?.trim() ?? "";
    if (dto.status === "REQUEST_CHANGES" && feedback === "") throw feedbackRequiredError();

    const o = await this.d.runner.run(seen.boardId, (tx) => this.submitInTx(tx, user.id, reviewId, { ...dto, feedback }));

    await this.publisher.publish(o.task.id, { actorId: user.id, moved: o.moved ? { before: o.before, after: o.task } : undefined, activities: o.activities });
    const reviews = await this.d.reviews.listByRound(o.round.id);
    // Review đã nộp + các review bị đóng theo (Yêu cầu sửa/đủ duyệt) không cần nhắc nữa.
    const done = reviews.filter((r) => r.status === "CANCELLED" || r.id === o.review.id).map((r) => r.id);
    await cancelRemindersBestEffort(this.reminders, this.d.defaults, done);

    const users = await this.d.directory.userSummaries(userIdsOf([o.round], reviews));
    const viewer = { userId: user.id, isAdmin: access.actions.has("workspace.board.edit"), isAssignee: false };
    const mine = reviews.find((r) => r.id === o.review.id) ?? o.review;
    return {
      review: presentReview(mine, users, visibilityOf(viewer, canSeeResults(viewer, o.round, reviews), mine)),
      round: presentRound(o.round, reviews, users, viewer),
      task: { id: o.task.id, reviewState: o.reviewState, columnId: o.task.columnId, columnKind: o.task.columnKind, position: o.task.position, version: o.task.version },
    };
  }

  private async submitInTx(tx: TxContext, userId: string, reviewId: string, dto: SubmitReviewDto): Promise<SubmitOutcome> {
    const now = nowOf(this.d);
    const review = await this.d.reviews.findById(reviewId, tx);
    if (!review) throw new ScopeNotFoundError();
    if (review.reviewerId !== userId) throw forbiddenError();
    const round = await this.d.rounds.findById(review.roundId, tx);
    if (!round) throw new ScopeNotFoundError();
    if (review.status !== "PENDING" || round.status !== "OPEN") throw reviewClosedError();

    const task = await this.d.tasks.findById(review.taskId, tx);
    if (!task || task.deletedAt) throw new ScopeNotFoundError();
    if (task.assigneeIds.includes(userId)) throw selfReviewError();
    const board = await this.d.boards.findById(task.boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    if (board.archivedAt) throw forbiddenError();
    if (review.version !== dto.expectedVersion) throw new VersionConflictError(review.version);

    const score = computeScore(round.rubricSnapshot, { rubricScores: dto.rubricScores, score10: dto.score10 });
    const submitted = await this.d.reviews.updatePendingCas(
      review.id,
      dto.expectedVersion,
      { status: dto.status, submittedAt: now, score10: score.score10, rubricScores: score.rubricScores, feedback: dto.feedback ? dto.feedback : null },
      tx
    );
    if (!submitted) throw reviewClosedError();

    const activities: TaskActivity[] = [
      await this.d.activity.record(tx, {
        taskId: task.id,
        boardId: task.boardId,
        workspaceId: task.workspaceId,
        actorId: userId,
        type: "REVIEW_SUBMITTED",
        before: null,
        after: { reviewId: submitted.id, roundId: round.id, status: submitted.status },
      }),
    ];
    const closing = dto.status === "REQUEST_CHANGES" ? await this.requestChanges(tx, board, task, round, userId, now) : await this.approve(tx, board, task, round, userId, now);
    activities.push(...closing.activities);
    for (const row of submittedRows(submitted, closing.round, task.assigneeIds)) await this.d.outbox.add(tx, row);
    return { ...closing, review: submitted, before: task, activities };
  }

  private async approve(tx: TxContext, board: Board, task: Task, round: TaskReviewRound, userId: string, now: Date): Promise<Closing> {
    const counted = await this.d.rounds.updateCas(round.id, round.version, { approvedCount: round.approvedCount + 1 }, tx);
    if (!counted) throw reviewClosedError();
    if (counted.approvedCount < counted.requiredReviews) return { round: counted, task, reviewState: "PENDING", moved: false, activities: [] };
    const closed = await this.rounds.approveRound(tx, counted, task, now, userId);
    if (!closed) throw reviewClosedError();
    const completed = await this.autoComplete?.complete(tx, { task, board });
    if (!completed) return { round: closed, task, reviewState: "APPROVED", moved: false, activities: [] };
    return { round: closed, task: completed.after, reviewState: "APPROVED", moved: true, activities: completed.activity ? [completed.activity] : [] };
  }

  /** Một người Yêu cầu sửa ⇒ đóng lượt ngay, không chờ người còn lại; thẻ về IN_PROGRESS do HỆ THỐNG (activity `MOVED`, actorId null). */
  private async requestChanges(tx: TxContext, board: Board, task: Task, round: TaskReviewRound, userId: string, now: Date): Promise<Closing> {
    await this.d.reviews.cancelPendingOfRound(round.id, "ROUND_CLOSED", tx);
    const closed = await this.d.rounds.updateCas(round.id, round.version, { status: "CHANGES_REQUESTED", closedAt: now, closeReason: "CHANGES_REQUESTED" }, tx);
    if (!closed) throw reviewClosedError();
    await this.d.tasks.setReviewState(task.id, "CHANGES_REQUESTED", tx);
    await this.d.outbox.add(tx, roundClosedRow(closed, "CHANGES_REQUESTED", task.assigneeIds, userId));

    const column = [...board.columns].sort((a, b) => a.order - b.order).find((c) => c.kind === "IN_PROGRESS");
    if (!column || column.id === task.columnId) return { round: closed, task, reviewState: "CHANGES_REQUESTED", moved: false, activities: [] };
    const position = betweenOrRepair(await this.d.tasks.lastPosition(board.id, column.id, task.id, tx), null, () => this.d.rebalance.schedule(board.id, column.id));
    const after = await this.d.tasks.moveCas(
      task.id,
      task.version,
      { columnId: column.id, columnKind: column.kind, position, completedAt: task.completedAt, completionCount: task.completionCount },
      tx
    );
    if (!after) throw new VersionConflictError(task.version);
    if (needsRebalance(after.position)) this.d.rebalance.schedule(board.id, column.id);
    const moved = await this.d.activity.record(tx, {
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId: null,
      type: "MOVED",
      before: { columnId: task.columnId, columnKind: task.columnKind },
      after: { columnId: after.columnId, columnKind: after.columnKind },
    });
    return { round: closed, task: after, reviewState: "CHANGES_REQUESTED", moved: true, activities: [moved] };
  }
}
