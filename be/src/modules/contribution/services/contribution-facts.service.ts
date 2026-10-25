import { logger } from "../../../infrastructure/logger";
import type { TaskEventPayload } from "../../projects";
import type { ReviewFact, ReviewFactStatus } from "../entities/contribution.interface";
import type { IContributionFactRepository } from "../repositories/contribution-fact.repository.interface";
import type { IContributionSourceRepository } from "../repositories/contribution-source.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { IContribConfigPort, IContribQueue } from "./contribution.ports";
import { recomputeJobId } from "./recompute-job-id";

type CompletedPayload = Extract<TaskEventPayload, { event: "task.completed" }>;
type ReopenedPayload = Extract<TaskEventPayload, { event: "task.reopened" }>;

/** Sự kiện `review.submitted` (p4-05) — chỉ `reviewId` bắt buộc; trường thiếu được đọc lại từ `TaskReview`. */
export interface ReviewSubmittedInput {
  reviewId: string;
  taskId?: string;
  boardId?: string;
  workspaceId?: string;
  reviewerId?: string;
  assigneeIds?: string[];
  status?: string;
  score10?: number | null;
  submittedAt?: string;
}

export type ReviewFactResult = "INSERTED" | "DUPLICATE" | "IGNORED";

export interface ContributionFactsDeps {
  facts: IContributionFactRepository;
  states: IContributionStateRepository;
  source: IContributionSourceRepository;
  config: IContribConfigPort;
  queue: IContribQueue;
  now?: () => Date;
}

const isScorable = (s: string | undefined): s is ReviewFactStatus => s === "APPROVED" || s === "REQUEST_CHANGES";

/**
 * Áp sự kiện vào FACT đóng góp (p4-06 be.md §5.1) — idempotent theo THỰC THỂ NGUỒN, không theo `jobId`:
 *  - `task.completed c<n>`: ghi khi `n` lớn hơn đã lưu; chạy lại cùng `n` không đổi gì (retry, song song với consumer XP p4-03);
 *  - `task.reopened c<n>`: chỉ vô hiệu khi `n` khớp lần hoàn thành đang tính; tới trước `completed c<n>` → bản giữ chỗ;
 *  - `review.submitted`: insert-only theo `reviewId`.
 * Có thay đổi thật → `factsVersion + 1` rồi xếp job tính lại (gom theo cửa sổ `recomputeDebounceSeconds`). Retry vào lúc fact đã ghi mà
 * chưa kịp xếp job vẫn xếp lại nhờ so `factsVersion` với `computedVersion`.
 */
export class ContributionFactsService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionFactsDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async onTaskCompleted(p: CompletedPayload): Promise<void> {
    const outcome = await this.d.facts.applyCompleted({
      taskId: p.taskId,
      boardId: p.boardId,
      workspaceId: p.workspaceId,
      assigneeIds: p.assigneeIds,
      storyPoints: p.storyPoints,
      dueDate: p.dueDate ? new Date(p.dueDate) : null,
      completedAt: new Date(p.completedAt),
      completionCount: p.completionCount,
      reviewApproved: typeof p.review?.approved === "boolean" ? p.review.approved : null,
    });
    await this.afterChange(p.boardId, p.workspaceId, outcome !== "SKIPPED", p.actorId);
  }

  async onTaskReopened(p: ReopenedPayload): Promise<void> {
    const outcome = await this.d.facts.applyReopened({
      taskId: p.taskId,
      boardId: p.boardId,
      workspaceId: p.workspaceId,
      assigneeIds: p.assigneeIds,
      completionCount: p.completionCount,
      reopenedAt: new Date(p.reopenedAt),
    });
    await this.afterChange(p.boardId, p.workspaceId, outcome !== "SKIPPED", p.actorId);
  }

  async onReviewSubmitted(input: ReviewSubmittedInput): Promise<ReviewFactResult> {
    const fact = await this.resolveReviewFact(input);
    if (!fact) return "IGNORED";
    const inserted = await this.d.facts.insertReviewFact(fact);
    await this.afterChange(fact.boardId, fact.workspaceId, inserted, fact.reviewerId);
    return inserted ? "INSERTED" : "DUPLICATE";
  }

  /** Sự kiện thẻ khác (tạo, giao, bình luận…) do người dùng gây ra: chỉ đánh dấu bảng "bẩn" cho job heatmap. Không bao giờ ném lỗi. */
  async onTaskActivity(p: TaskEventPayload): Promise<void> {
    if (!p.actorId) return;
    try {
      await this.markDirty(p.boardId, p.workspaceId);
    } catch (err) {
      logger.warn("[contribution] không đánh dấu được hoạt động mới (bỏ qua, heatmap tự tính lại khi xem/đối soát)", {
        boardId: p.boardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Đối soát sửa được fact của bảng → tăng phiên bản + xếp tính lại (không đánh dấu heatmap: không có người gây ra). */
  async touch(boardId: string, workspaceId: string): Promise<void> {
    await this.afterChange(boardId, workspaceId, true, null);
  }

  /** Bảng còn ở trạng thái `factsVersion > computedVersion` thì xếp job tính lại (đối soát/retry dùng). Trùng cửa sổ ⇒ BullMQ bỏ qua. */
  async ensureRecompute(boardId: string): Promise<boolean> {
    const state = await this.d.states.get(boardId);
    if (!state || state.factsVersion <= state.computedVersion) return false;
    await this.requestRecompute(boardId);
    return true;
  }

  /** Xếp job tính lại KHÔNG điều kiện (vd múi giờ đổi: fact không đổi nhưng ranh giới kỳ đổi). Cùng cửa sổ debounce với `ensureRecompute`. */
  async requestRecompute(boardId: string): Promise<void> {
    const { jobId, delayMs } = recomputeJobId(boardId, this.now().getTime());
    await this.d.queue.enqueueRecompute(boardId, jobId, delayMs);
  }

  private async afterChange(boardId: string, workspaceId: string, changed: boolean, actorId: string | null): Promise<void> {
    const defaults = await this.d.config.defaults();
    // Sự kiện bị bỏ (retry) nhưng bảng CHƯA từng được tăng phiên bản (lần chạy trước có thể ghi fact rồi chết trước khi tăng) → tăng đúng một lần.
    const neverBumped = !changed && ((await this.d.states.get(boardId))?.factsVersion ?? 0) === 0;
    if (changed || neverBumped) await this.d.states.bumpFactsVersion(boardId, workspaceId, defaults);
    if (changed && actorId) await this.markDirty(boardId, workspaceId).catch(() => undefined);
    await this.ensureRecompute(boardId);
  }

  private async markDirty(boardId: string, workspaceId: string): Promise<void> {
    await this.d.states.markActivityDirty(boardId, workspaceId, await this.d.config.defaults(), this.now());
  }

  /** Gộp payload + bản ghi `TaskReview` (nguồn sự thật) thành fact; `null` nếu không phải lượt chấm đã nộp. */
  private async resolveReviewFact(input: ReviewSubmittedInput): Promise<ReviewFact | null> {
    const complete = input.taskId && input.boardId && input.workspaceId && input.reviewerId && input.submittedAt && isScorable(input.status);
    const stored = complete ? null : await this.d.source.findSubmittedReview(input.reviewId);
    if (!complete && !stored) return null;

    const taskId = input.taskId ?? stored?.taskId;
    const boardId = input.boardId ?? stored?.boardId;
    const workspaceId = input.workspaceId ?? stored?.workspaceId;
    const reviewerId = input.reviewerId ?? stored?.reviewerId;
    const status = isScorable(input.status) ? input.status : stored?.status;
    const submittedAtRaw = input.submittedAt ?? stored?.submittedAt.toISOString();
    if (!taskId || !boardId || !workspaceId || !reviewerId || !status || !submittedAtRaw) return null;

    const assigneeIds = input.assigneeIds ?? (await this.d.source.currentAssignees([taskId])).get(taskId) ?? [];
    return {
      reviewId: input.reviewId,
      taskId,
      boardId,
      workspaceId,
      reviewerId,
      assigneeIds,
      status,
      score10: typeof input.score10 === "number" ? input.score10 : (stored?.score10 ?? null),
      submittedAt: new Date(submittedAtRaw),
    };
  }
}
