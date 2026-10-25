import { LIMITS } from "../../../../core/constants/limits";
import { ScopeNotFoundError, ValidationError, VersionConflictError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import type { ReassignReviewDto } from "../../dtos";
import type { Board } from "../../entities/board.interface";
import type { TaskReview, TaskReviewRound } from "../../entities/task-review.interface";
import type { Task, TaskActivity } from "../../entities/task.interface";
import type { TxContext } from "../../repositories/unit-of-work";
import type { MoveOutcome } from "../task-move.service";
import { parseBoardReview } from "./review-config.schema";
import { noReviewerError, reviewClosedError } from "./review-errors";
import { assignedRow, cancelledRow, roundClosedRow, shortageRow } from "./review-events";
import { presentReview, userIdsOf, type TaskReviewDto } from "./review.presenter";
import { visibilityOf } from "./review-visibility";
import { pickReviewers } from "./reviewer-selector";
import type { ReviewPublisher } from "./review-publisher";
import { cancelRemindersBestEffort, type IReviewReminders } from "./review-reminders";
import type { ReviewRoundService } from "./review-round.service";
import type { IReviewAutoComplete } from "./review-auto-complete";
import { nowOf, type ReviewDeps } from "./review.deps";

/** Vì sao một người chấm không còn hợp lệ (tự động) — ghi vào `TaskReview.cancelReason`. */
export type ReplaceCause = "MEMBER_LEFT" | "BECAME_ASSIGNEE";

export interface ReplaceOutcome {
  taskId: string;
  round: TaskReviewRound;
  /** `null` khi không có người thay (lượt giảm số duyệt cần / tự duyệt). */
  replacement: TaskReview | null;
  activities: TaskActivity[];
  /** Có khi lượt vừa đủ duyệt (giảm số duyệt cần) và bảng bật `autoCompleteOnApproval` ⇒ thẻ đã được chuyển sang DONE — caller phát `task:moved`. */
  moved?: { before: Task; after: Task };
}

/**
 * Giao lại người chấm (p4-05 be.md §5.4): THỦ CÔNG bởi OWNER/ADMIN (`reassign`, có lý do + audit) và TỰ ĐỘNG (`replaceReviewer`) khi người chấm
 * rời nhóm/bị ẩn danh hoá/trở thành người làm. Người thay = ứng viên cân tải, KHÔNG phải người làm và chưa có review nào trong lượt (unique
 * `(roundId, reviewerId)`). Không có người thay ⇒ `requiredReviews` giảm (không dưới số đã duyệt), `shortage = true`, báo OWNER/ADMIN; giảm tới đúng
 * số đã duyệt (> 0) ⇒ đóng `APPROVED`; còn 0 ⇒ tự duyệt (`autoApproved`).
 */
export class ReviewReassignService {
  constructor(
    private readonly d: ReviewDeps,
    private readonly rounds: ReviewRoundService,
    private readonly publisher: ReviewPublisher,
    private readonly reminders?: IReviewReminders,
    private readonly autoComplete?: IReviewAutoComplete
  ) {}

  async reassign(user: AuthUser, reviewId: string, dto: ReassignReviewDto): Promise<{ cancelled: TaskReviewDto; assigned: TaskReviewDto }> {
    const seen = await this.d.reviews.findById(reviewId);
    if (!seen) throw new ScopeNotFoundError();
    await this.d.access.board(user, seen.boardId, "workspace.board.edit");

    const out = await this.d.runner.run(seen.boardId, (tx) => this.reassignInTx(tx, user.id, reviewId, dto));
    await this.d.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "task-review.reassign",
      targetType: "TaskReview",
      targetId: reviewId,
      workspaceId: seen.workspaceId,
      reason: dto.reason,
      metadata: { taskId: seen.taskId, roundId: seen.roundId, from: out.old.reviewerId, to: out.next.reviewerId },
    });
    await this.publisher.publish(seen.taskId, { actorId: user.id, activities: out.activities });
    await cancelRemindersBestEffort(this.reminders, this.d.defaults, [out.old.id]);

    const users = await this.d.directory.userSummaries(userIdsOf([], [out.old, out.next]));
    const viewer = { userId: user.id, isAdmin: true, isAssignee: false };
    const dtoOf = (r: TaskReview): TaskReviewDto => presentReview(r, users, visibilityOf(viewer, true, r));
    return { cancelled: dtoOf(out.old), assigned: dtoOf(out.next) };
  }

  private async reassignInTx(tx: TxContext, actorId: string, reviewId: string, dto: ReassignReviewDto) {
    const now = nowOf(this.d);
    const review = await this.d.reviews.findById(reviewId, tx);
    if (!review) throw new ScopeNotFoundError();
    const round = await this.d.rounds.findById(review.roundId, tx);
    if (!round) throw new ScopeNotFoundError();
    if (review.status !== "PENDING" || round.status !== "OPEN") throw reviewClosedError();
    const { task, board } = await this.context(tx, review);

    const taken = new Set([...(await this.d.reviews.listByRound(round.id, tx)).map((r) => r.reviewerId), ...task.assigneeIds]);
    const pool = parseBoardReview(board.review).reviewerPool;
    const toUserId = dto.toUserId ?? (await this.pickOne(tx, task, taken, pool ? new Set(pool) : null));
    if (!toUserId) throw noReviewerError();
    if (dto.toUserId) await this.assertEligible(task, taken, dto.toUserId, pool);

    const [next] = await this.d.reviews.createMany([{ roundId: round.id, taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, reviewerId: toUserId, assignedBy: actorId, assignedAt: now }], tx);
    const old = await this.d.reviews.updatePendingCas(review.id, review.version, { status: "REASSIGNED", cancelReason: "MANUAL", replacedById: next.id }, tx);
    if (!old) throw new VersionConflictError(review.version);
    const activity = await this.d.activity.record(tx, {
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId,
      type: "REVIEW_REASSIGNED",
      before: { userId: review.reviewerId },
      after: { userId: toUserId, roundId: round.id, cause: "MANUAL" },
    });
    await this.d.outbox.add(tx, assignedRow(round, [next], "REASSIGNED"));
    await this.d.outbox.add(tx, cancelledRow(round, [old], "MANUAL", "REVIEW"));
    return { old, next, activities: [activity] };
  }

  /**
   * Thay TỰ ĐỘNG một review PENDING không còn hợp lệ — gọi TRONG transaction của caller (`runner.run`). Idempotent theo thực thể nguồn: review đã
   * không còn PENDING / lượt đã đóng ⇒ `null`, chạy lại không đổi gì.
   */
  async replaceReviewer(tx: TxContext, reviewId: string, cause: ReplaceCause): Promise<ReplaceOutcome | null> {
    const now = nowOf(this.d);
    const review = await this.d.reviews.findById(reviewId, tx);
    if (!review || review.status !== "PENDING") return null;
    const round = await this.d.rounds.findById(review.roundId, tx);
    if (!round || round.status !== "OPEN") return null;
    const task = await this.d.tasks.findById(review.taskId, tx);
    const board = task ? await this.d.boards.findById(task.boardId, tx) : null;
    if (!task || task.deletedAt || !board) return null;

    const others = (await this.d.reviews.listByRound(round.id, tx)).filter((r) => r.id !== review.id);
    const taken = new Set([...others.map((r) => r.reviewerId), review.reviewerId, ...task.assigneeIds]);
    const pool = parseBoardReview(board.review).reviewerPool;
    const replacementId = await this.pickOne(tx, task, taken, pool ? new Set(pool) : null);

    if (replacementId) {
      const [next] = await this.d.reviews.createMany([{ roundId: round.id, taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, reviewerId: replacementId, assignedBy: null, assignedAt: now }], tx);
      const old = await this.d.reviews.updatePendingCas(review.id, review.version, { status: "REASSIGNED", cancelReason: cause, replacedById: next.id }, tx);
      if (!old) return null;
      const activity = await this.recordReassigned(tx, task, round, review.reviewerId, replacementId, cause);
      await this.d.outbox.add(tx, assignedRow(round, [next], "REASSIGNED"));
      return { taskId: task.id, round, replacement: next, activities: [activity] };
    }
    return this.shrink(tx, { review, round, task, board, others, cause, now });
  }

  /** Không có người thay: bỏ review này, giảm số duyệt cần theo số người còn chấm được (không dưới số đã duyệt). */
  private async shrink(
    tx: TxContext,
    p: { review: TaskReview; round: TaskReviewRound; task: Task; board: Board; others: TaskReview[]; cause: ReplaceCause; now: Date }
  ): Promise<ReplaceOutcome | null> {
    const { review, round, task, cause, now } = p;
    const gone = await this.d.reviews.updatePendingCas(review.id, review.version, { status: "CANCELLED", cancelReason: cause }, tx);
    if (!gone) return null;
    const stillPending = p.others.filter((r) => r.status === "PENDING").length;
    const required = Math.min(round.requiredReviews, round.approvedCount + stillPending);
    const shrunk = await this.d.rounds.updateCas(round.id, round.version, { requiredReviews: required, assignedCount: round.approvedCount + stillPending, shortage: true }, tx);
    if (!shrunk) return null;

    let current: TaskReviewRound = shrunk;
    let completed: MoveOutcome | null = null;
    if (required === 0) {
      const auto = await this.d.rounds.updateCas(shrunk.id, shrunk.version, { status: "APPROVED", autoApproved: true, closedAt: now, closeReason: "APPROVED" }, tx);
      if (auto) {
        current = auto;
        await this.d.tasks.setReviewState(task.id, "APPROVED", tx);
        await this.d.outbox.add(tx, roundClosedRow(auto, "APPROVED", task.assigneeIds, null));
      }
    } else if (shrunk.approvedCount >= required) {
      const closed = await this.rounds.approveRound(tx, shrunk, task, now, null);
      current = closed ?? shrunk;
      // Đủ số duyệt THẬT (≥ 1 người đã duyệt) mới tự chuyển Done; lượt tự duyệt vì không còn người chấm (`required === 0`) thì không.
      if (closed) completed = (await this.autoComplete?.complete(tx, { task, board: p.board })) ?? null;
    }
    await this.d.outbox.add(tx, shortageRow(current));
    const activity = await this.recordReassigned(tx, task, current, review.reviewerId, null, cause);
    return {
      taskId: task.id,
      round: current,
      replacement: null,
      activities: completed?.activity ? [activity, completed.activity] : [activity],
      ...(completed && { moved: { before: completed.before, after: completed.after } }),
    };
  }

  private recordReassigned(tx: TxContext, task: Task, round: TaskReviewRound, from: string, to: string | null, cause: ReplaceCause): Promise<TaskActivity> {
    return this.d.activity.record(tx, {
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId: null,
      type: "REVIEW_REASSIGNED",
      before: { userId: from },
      after: { userId: to, roundId: round.id, cause },
    });
  }

  /** Ứng viên cân tải đầu tiên ngoài `taken` (và trong `pool` nếu có); `null` khi không còn ai. */
  private async pickOne(tx: TxContext, task: Task, taken: ReadonlySet<string>, pool: ReadonlySet<string> | null): Promise<string | null> {
    const candidates = (await this.d.directory.listReviewerCandidateIds(task.workspaceId, LIMITS.review.candidateScanMax)).filter((id) => !taken.has(id) && (!pool || pool.has(id)));
    if (candidates.length === 0) return null;
    const loads = await this.d.reviews.loadsOf(task.workspaceId, candidates, tx);
    return pickReviewers({ candidates, loads, taskId: task.id }, 1)[0] ?? null;
  }

  /** `toUserId` do OWNER/ADMIN chọn: phải là thành viên MEMBER+ đang hoạt động, không phải người làm/đã có review trong lượt, và thuộc nhóm người chấm (nếu có). */
  private async assertEligible(task: Task, taken: ReadonlySet<string>, toUserId: string, pool: string[] | undefined): Promise<void> {
    const active = await this.d.directory.activeReviewerIds(task.workspaceId, [toUserId]);
    const problem = !active.has(toUserId)
      ? "Người này không phải thành viên đang hoạt động của nhóm"
      : task.assigneeIds.includes(toUserId)
        ? "Người này đang là người thực hiện thẻ"
        : taken.has(toUserId)
          ? "Người này đã được giao chấm thẻ trong lượt này"
          : pool && !pool.includes(toUserId)
            ? "Người này không thuộc nhóm người chấm của bảng"
            : null;
    if (problem) throw new ValidationError("Người chấm không hợp lệ", { toUserId: [problem] });
  }

  private async context(tx: TxContext, review: TaskReview) {
    const task = await this.d.tasks.findById(review.taskId, tx);
    if (!task || task.deletedAt) throw new ScopeNotFoundError();
    const board = await this.d.boards.findById(task.boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    return { task, board };
  }
}
