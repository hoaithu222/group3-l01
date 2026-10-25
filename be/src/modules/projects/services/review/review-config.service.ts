import { LIMITS } from "../../../../core/constants/limits";
import { ScopeNotFoundError, VersionConflictError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import { eventKeys } from "../../../../shared/events/domain-events";
import type { PutReviewConfigDto } from "../../dtos";
import type { Board } from "../../entities/board.interface";
import type { BoardReviewConfig, RubricCriterion } from "../../entities/task-review.interface";
import { assignCriterionIds, parseBoardReview } from "./review-config.schema";
import { invalidConfigError } from "./review-errors";
import { REVIEW_BACKFILL_JOB, REVIEW_BACKFILL_QUEUE } from "./review-events";
import type { ReviewDeps } from "./review.deps";

export interface ReviewConfigDto {
  enabled: boolean;
  requiredReviews: number;
  rubric: RubricCriterion[];
  reviewerPool?: string[];
  autoCompleteOnApproval: boolean;
  /** Số người chấm được của nhóm (thành viên MEMBER+ đang hoạt động, trong nhóm người chấm nếu có) — "Nhóm có N người chấm được". */
  eligibleReviewerCount: number;
  openRoundCount: number;
  /** `Board.version` — làm `expectedVersion` khi lưu. */
  version: number;
}

/**
 * Payload job `review.backfill`: bật ⇒ mở lượt cho thẻ đang ở REVIEW; tắt ⇒ huỷ lượt đang mở (`REVIEW_DISABLED`); `SYNC` ⇒ đối soát sau khi đổi `kind` cột (`PUT /boards/:id/columns`):
 * mở lượt cho thẻ mới vào cột REVIEW, đóng lượt (`LEFT_REVIEW`) và bỏ trạng thái "đã duyệt" của thẻ không còn ở REVIEW/DONE.
 */
export interface ReviewBackfillJob {
  boardId: string;
  version: number;
  mode: "ENABLE" | "DISABLE" | "SYNC";
}

/**
 * Cấu hình chấm chéo của bảng (p4-05 be.md §5.5): xem (thành viên MEMBER+) và ghi đè (OWNER/ADMIN, CAS `Board.version`). Đổi rubric/số lượt chỉ áp cho lượt MỚI
 * (lượt đang mở giữ `rubricSnapshot`); bật/tắt ghi outbox `review.backfill` để job mở/huỷ lượt hàng loạt sau commit.
 */
export class ReviewConfigService {
  constructor(private readonly d: ReviewDeps) {}

  async get(user: AuthUser, boardId: string): Promise<ReviewConfigDto> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.read");
    return this.present(board);
  }

  async put(user: AuthUser, boardId: string, dto: PutReviewConfigDto): Promise<ReviewConfigDto> {
    const { board: seen } = await this.d.access.board(user, boardId, "workspace.board.edit");
    const next = await this.validate(seen, dto);

    const updated = await this.d.runner.run(boardId, async (tx) => {
      const current = await this.d.boards.findById(boardId, tx);
      if (!current) throw new ScopeNotFoundError();
      if (current.version !== dto.expectedVersion) throw new VersionConflictError(current.version);
      const saved = await this.d.boards.updateReviewCas(boardId, dto.expectedVersion, next, tx);
      if (!saved) throw new VersionConflictError(current.version);
      if (parseBoardReview(current.review).enabled !== next.enabled) {
        const job: ReviewBackfillJob = { boardId, version: saved.version, mode: next.enabled ? "ENABLE" : "DISABLE" };
        await this.d.outbox.add(tx, {
          type: "review.backfill",
          aggregateType: "Board",
          aggregateId: boardId,
          queue: REVIEW_BACKFILL_QUEUE,
          jobName: REVIEW_BACKFILL_JOB,
          dedupeKey: eventKeys.reviewBackfill(boardId, saved.version),
          payload: job as unknown as Record<string, unknown>,
        });
      }
      return saved;
    });
    this.d.emitter.boardUpdated(boardId, { boardId, version: updated.version });
    return this.present(updated);
  }

  /** Rubric (id ổn định) + nhóm người chấm hợp lệ → `REVIEW_004` kèm lỗi theo trường. */
  private async validate(board: Board, dto: PutReviewConfigDto): Promise<BoardReviewConfig> {
    const existing = new Set(parseBoardReview(board.review).rubric.map((c) => c.id));
    const { rubric, problems } = assignCriterionIds(dto.rubric, existing);
    const errors: Record<string, string[]> = {};
    if (problems.length > 0) errors.rubric = [...new Set(problems.map((p) => p.message))];

    const pool = dto.reviewerPool ? [...new Set(dto.reviewerPool)] : [];
    if (pool.length > 0) {
      const valid = await this.d.directory.activeReviewerIds(board.workspaceId, pool);
      const bad = pool.filter((id) => !valid.has(id));
      if (bad.length > 0) errors.reviewerPool = [`${bad.length} người không phải thành viên đang hoạt động của nhóm`];
    }
    if (Object.keys(errors).length > 0) throw invalidConfigError(errors);

    return {
      enabled: dto.enabled,
      requiredReviews: dto.requiredReviews,
      rubric,
      preventSelfReview: true,
      ...(pool.length > 0 && { reviewerPool: pool }),
      autoCompleteOnApproval: dto.autoCompleteOnApproval,
    };
  }

  private async present(board: Board): Promise<ReviewConfigDto> {
    const config = parseBoardReview(board.review);
    const [candidates, openRoundCount] = await Promise.all([
      this.d.directory.listReviewerCandidateIds(board.workspaceId, LIMITS.review.candidateScanMax),
      this.d.rounds.countOpenByBoard(board.id),
    ]);
    const pool = config.reviewerPool ? new Set(config.reviewerPool) : null;
    return {
      enabled: config.enabled,
      requiredReviews: config.requiredReviews,
      rubric: config.rubric,
      ...(config.reviewerPool && { reviewerPool: config.reviewerPool }),
      autoCompleteOnApproval: config.autoCompleteOnApproval,
      eligibleReviewerCount: pool ? candidates.filter((id) => pool.has(id)).length : candidates.length,
      openRoundCount,
      version: board.version,
    };
  }
}
