import { LIMITS } from "../../../../core/constants/limits";
import { newObjectId } from "../../../../core/utils/object-id";
import type { Board } from "../../entities/board.interface";
import type { BoardReviewConfig, TaskReview, TaskReviewRound } from "../../entities/task-review.interface";
import type { Task } from "../../entities/task.interface";
import type { TxContext } from "../../repositories/unit-of-work";
import { assignedRow, cancelledRow, roundClosedRow, shortageRow } from "./review-events";
import { pickReviewers } from "./reviewer-selector";
import type { ReviewDeps } from "./review.deps";

export interface OpenedRound {
  round: TaskReviewRound;
  reviews: TaskReview[];
  /** `false` khi thẻ đã có lượt đang mở (idempotent — không tạo thêm). */
  created: boolean;
}

/**
 * Vòng đời một lượt chấm (p4-05 be.md §5.1–§5.2). Mọi hàm nhận `tx` và CHẠY TRONG transaction của caller — hoặc `move` (hiệu ứng
 * vào/rời REVIEW) hoặc `BoardWriteRunner.run` (nộp chấm, giao lại, miễn chấm, backfill) — nên lượt, review, `reviewState`, activity
 * và outbox luôn cùng commit. Realtime + thông báo đi sau commit (outbox → `review.events`, hoặc `ReviewPublisher` cho request).
 */
export class ReviewRoundService {
  constructor(private readonly d: ReviewDeps) {}

  /**
   * Mở lượt cho thẻ vừa vào REVIEW: chọn người chấm cân tải (loại người làm), `requiredReviews` thực = min(cấu hình, số ứng viên);
   * 0 ứng viên ⇒ tự duyệt (`autoApproved`). Idempotent: đã có lượt OPEN thì trả lượt đó.
   */
  async openRound(tx: TxContext, p: { task: Task; board: Board; config: BoardReviewConfig; openedBy: string | null; now: Date }): Promise<OpenedRound> {
    const { task, config, now } = p;
    const existing = await this.d.rounds.findOpen(task.id, tx);
    if (existing) {
      if (task.reviewState !== "PENDING") await this.d.tasks.setReviewState(task.id, "PENDING", tx);
      return { round: existing, reviews: await this.d.reviews.listByRound(existing.id, tx), created: false };
    }

    const latest = await this.d.rounds.findLatest(task.id, tx);
    const previous = new Set((latest ? await this.d.reviews.listByRound(latest.id, tx) : []).map((r) => r.reviewerId));
    const pool = config.reviewerPool ? new Set(config.reviewerPool) : null;
    const candidates = (await this.d.directory.listReviewerCandidateIds(task.workspaceId, LIMITS.review.candidateScanMax)).filter(
      (id) => !task.assigneeIds.includes(id) && (!pool || pool.has(id))
    );
    const loads = await this.d.reviews.loadsOf(task.workspaceId, candidates, tx);
    const picked = pickReviewers({ candidates, loads, previousReviewers: previous, taskId: task.id }, config.requiredReviews);

    const autoApproved = picked.length === 0;
    const round = await this.d.rounds.create(
      {
        id: newObjectId(),
        taskId: task.id,
        boardId: task.boardId,
        workspaceId: task.workspaceId,
        round: (latest?.round ?? 0) + 1,
        status: autoApproved ? "APPROVED" : "OPEN",
        requiredReviews: picked.length,
        configuredReviews: config.requiredReviews,
        assignedCount: picked.length,
        approvedCount: 0,
        rubricSnapshot: config.rubric,
        shortage: picked.length < config.requiredReviews,
        autoApproved,
        openedBy: p.openedBy,
        openedAt: now,
        closedAt: autoApproved ? now : null,
        closeReason: autoApproved ? "APPROVED" : null,
      },
      tx
    );
    const reviews = await this.d.reviews.createMany(
      picked.map((reviewerId) => ({ roundId: round.id, taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, reviewerId, assignedBy: null, assignedAt: now })),
      tx
    );
    await this.d.tasks.setReviewState(task.id, autoApproved ? "APPROVED" : "PENDING", tx);
    await this.d.activity.record(tx, {
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId: null,
      type: "REVIEW_REQUESTED",
      before: null,
      after: { roundId: round.id, round: round.round, reviewerIds: picked, autoApproved, shortage: round.shortage },
    });

    if (reviews.length > 0) await this.d.outbox.add(tx, assignedRow(round, reviews, "ROUND_OPENED"));
    if (round.shortage) await this.d.outbox.add(tx, shortageRow(round));
    if (autoApproved) await this.d.outbox.add(tx, roundClosedRow(round, "APPROVED", task.assigneeIds, null));
    return { round, reviews, created: true };
  }

  /**
   * Đóng lượt ĐANG MỞ thành `CANCELLED` (rời REVIEW, tắt chấm chéo, thẻ bị xoá): review chờ → `CANCELLED`, báo người chấm, và trừ khi thẻ bị
   * xoá thì `reviewState = NONE` (vào DONE sau này cần lượt mới). Trả các review vừa huỷ; `null` khi không còn lượt mở.
   */
  async cancelOpenRound(
    tx: TxContext,
    task: Pick<Task, "id">,
    reason: "LEFT_REVIEW" | "REVIEW_DISABLED" | "TASK_DELETED",
    now: Date
  ): Promise<{ round: TaskReviewRound; cancelled: TaskReview[] } | null> {
    const round = await this.d.rounds.findOpen(task.id, tx);
    if (!round) return null;
    const cancelled = await this.d.reviews.cancelPendingOfRound(round.id, reason === "REVIEW_DISABLED" ? "REVIEW_DISABLED" : "ROUND_CLOSED", tx);
    const closed = await this.d.rounds.updateCas(round.id, round.version, { status: "CANCELLED", closedAt: now, closeReason: reason }, tx);
    if (!closed) return null; // đã có người đóng lượt này giữa chừng — không đổi gì thêm
    if (reason !== "TASK_DELETED") await this.d.tasks.setReviewState(task.id, "NONE", tx);
    if (cancelled.length > 0) await this.d.outbox.add(tx, cancelledRow(closed, cancelled, reason));
    return { round: closed, cancelled };
  }

  /**
   * Đủ số lượt duyệt (hoặc `requiredReviews` giảm xuống bằng `approvedCount` sau khi người chấm rời nhóm): đóng lượt `APPROVED`, huỷ review
   * còn chờ (giao dư), `reviewState = APPROVED`, báo người làm. Trả lượt đã đóng.
   */
  async approveRound(tx: TxContext, round: TaskReviewRound, task: Pick<Task, "id" | "assigneeIds">, now: Date, actorId: string | null): Promise<TaskReviewRound | null> {
    const closed = await this.d.rounds.updateCas(round.id, round.version, { status: "APPROVED", closedAt: now, closeReason: "APPROVED" }, tx);
    if (!closed) return null;
    await this.d.reviews.cancelPendingOfRound(round.id, "ROUND_CLOSED", tx);
    await this.d.tasks.setReviewState(task.id, "APPROVED", tx);
    await this.d.outbox.add(tx, roundClosedRow(closed, "APPROVED", task.assigneeIds, actorId));
    return closed;
  }
}
