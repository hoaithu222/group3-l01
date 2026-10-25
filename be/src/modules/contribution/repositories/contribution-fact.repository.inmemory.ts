/* eslint-disable @typescript-eslint/require-await -- bản in-memory (test) cài đặt interface bất đồng bộ */
import type { CompletedOutcome, ReopenedInput, ReopenedOutcome, ReviewFact, TaskFact, TaskFactInput } from "../entities/contribution.interface";
import type { FactRange, IContributionFactRepository, MemberTaskCursor, MemberTaskPage } from "./contribution-fact.repository.interface";

const inRange = (at: Date, range: FactRange): boolean => (!range.from || at >= range.from) && (!range.to || at < range.to);

/** In-memory (test) — cùng ngữ nghĩa với bản Prisma: ghi có điều kiện theo `completionCount`, unique theo `taskId`/`reviewId`. */
export class InMemoryContributionFactRepository implements IContributionFactRepository {
  readonly tasks = new Map<string, TaskFact>();
  readonly reviews = new Map<string, ReviewFact>();

  async applyCompleted(input: TaskFactInput): Promise<CompletedOutcome> {
    const stored = this.tasks.get(input.taskId);
    if (!stored) {
      this.tasks.set(input.taskId, { ...input, assigneeIds: [...input.assigneeIds], active: true });
      return "CREATED";
    }
    if (input.completionCount <= stored.completionCount) return "SKIPPED";
    this.tasks.set(input.taskId, { ...input, assigneeIds: [...input.assigneeIds], active: true });
    return "UPDATED";
  }

  async applyReopened(input: ReopenedInput): Promise<ReopenedOutcome> {
    const stored = this.tasks.get(input.taskId);
    if (!stored) {
      this.tasks.set(input.taskId, {
        taskId: input.taskId,
        boardId: input.boardId,
        workspaceId: input.workspaceId,
        assigneeIds: [...input.assigneeIds],
        storyPoints: null,
        dueDate: null,
        completedAt: input.reopenedAt,
        completionCount: input.completionCount,
        active: false,
        reviewApproved: null,
      });
      return "PLACEHOLDER";
    }
    if (stored.completionCount === input.completionCount && stored.active) {
      stored.active = false;
      return "DEACTIVATED";
    }
    if (stored.completionCount < input.completionCount) {
      stored.completionCount = input.completionCount;
      stored.active = false;
      return "PLACEHOLDER";
    }
    return "SKIPPED";
  }

  async insertReviewFact(fact: ReviewFact): Promise<boolean> {
    if (this.reviews.has(fact.reviewId)) return false;
    this.reviews.set(fact.reviewId, { ...fact, assigneeIds: [...fact.assigneeIds] });
    return true;
  }

  async listActiveTaskFacts(boardId: string): Promise<TaskFact[]> {
    return [...this.tasks.values()].filter((f) => f.boardId === boardId && f.active);
  }

  async listReviewFacts(boardId: string): Promise<ReviewFact[]> {
    return [...this.reviews.values()].filter((f) => f.boardId === boardId);
  }

  async listMemberTaskFacts(boardId: string, userId: string, range: FactRange, cursor: MemberTaskCursor | null, limit: number): Promise<MemberTaskPage> {
    const sorted = [...this.tasks.values()]
      .filter((f) => f.boardId === boardId && f.active && f.assigneeIds.includes(userId) && inRange(f.completedAt, range))
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime() || (a.taskId < b.taskId ? 1 : -1));
    const after = cursor
      ? sorted.filter((f) => f.completedAt < cursor.at || (f.completedAt.getTime() === cursor.at.getTime() && f.taskId < cursor.taskId))
      : sorted;
    const items = after.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: after.length > limit && last ? { at: last.completedAt, taskId: last.taskId } : null };
  }

  async listReviewFactsForTasks(boardId: string, taskIds: readonly string[], range: FactRange): Promise<ReviewFact[]> {
    const ids = new Set(taskIds);
    return [...this.reviews.values()].filter((r) => r.boardId === boardId && ids.has(r.taskId) && inRange(r.submittedAt, range));
  }

  async findTaskFacts(taskIds: readonly string[]): Promise<TaskFact[]> {
    return taskIds.map((id) => this.tasks.get(id)).filter((f): f is TaskFact => f !== undefined);
  }

  async deactivate(taskIds: readonly string[]): Promise<number> {
    let n = 0;
    for (const id of taskIds) {
      const f = this.tasks.get(id);
      if (f?.active) {
        f.active = false;
        n += 1;
      }
    }
    return n;
  }

  async countBoardFacts(boardId: string): Promise<{ tasks: number; reviews: number }> {
    return {
      tasks: [...this.tasks.values()].filter((f) => f.boardId === boardId && f.active).length,
      reviews: [...this.reviews.values()].filter((r) => r.boardId === boardId).length,
    };
  }
}
