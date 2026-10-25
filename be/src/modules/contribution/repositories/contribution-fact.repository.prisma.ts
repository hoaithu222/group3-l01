import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CompletedOutcome, ReopenedInput, ReopenedOutcome, ReviewFact, ReviewFactStatus, TaskFact, TaskFactInput } from "../entities/contribution.interface";
import type { FactRange, IContributionFactRepository, MemberTaskCursor, MemberTaskPage } from "./contribution-fact.repository.interface";
import { isPrismaUniqueViolation } from "./tx";

/** Trần an toàn số fact đọc một lần cho MỘT bảng (bảng ≤ `LIMITS.task.perBoardMax` thẻ; lượt chấm nhiều hơn nhưng vẫn nhỏ). */
const TASK_FACT_SCAN_MAX = 50_000;
const REVIEW_FACT_SCAN_MAX = 200_000;

type TaskFactRecord = Prisma.ContributionTaskFactGetPayload<Record<string, never>>;
type ReviewFactRecord = Prisma.ContributionReviewFactGetPayload<Record<string, never>>;

const toTaskFact = (r: TaskFactRecord): TaskFact => ({
  taskId: r.taskId,
  boardId: r.boardId,
  workspaceId: r.workspaceId,
  assigneeIds: r.assigneeIds,
  storyPoints: r.storyPoints ?? null,
  dueDate: r.dueDate ?? null,
  completedAt: r.completedAt,
  completionCount: r.completionCount,
  active: r.active,
  reviewApproved: r.reviewApproved ?? null,
});

const toReviewFact = (r: ReviewFactRecord): ReviewFact => ({
  reviewId: r.reviewId,
  taskId: r.taskId,
  boardId: r.boardId,
  workspaceId: r.workspaceId,
  reviewerId: r.reviewerId,
  assigneeIds: r.assigneeIds,
  status: r.status as ReviewFactStatus,
  score10: r.score10 ?? null,
  submittedAt: r.submittedAt,
});

const dateRange = (range: FactRange): { gte?: Date; lt?: Date } | undefined =>
  range.from || range.to ? { ...(range.from && { gte: range.from }), ...(range.to && { lt: range.to }) } : undefined;

export class PrismaContributionFactRepository implements IContributionFactRepository {
  async applyCompleted(input: TaskFactInput): Promise<CompletedOutcome> {
    const data = {
      boardId: input.boardId,
      workspaceId: input.workspaceId,
      assigneeIds: input.assigneeIds,
      storyPoints: input.storyPoints,
      dueDate: input.dueDate,
      completedAt: input.completedAt,
      completionCount: input.completionCount,
      active: true,
      reviewApproved: input.reviewApproved,
    };
    const advance = () => prisma.contributionTaskFact.updateMany({ where: { taskId: input.taskId, completionCount: { lt: input.completionCount } }, data });
    if ((await advance()).count > 0) return "UPDATED";
    if (await prisma.contributionTaskFact.findUnique({ where: { taskId: input.taskId }, select: { id: true } })) return "SKIPPED";
    try {
      await prisma.contributionTaskFact.create({ data: { taskId: input.taskId, ...data } });
      return "CREATED";
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      // Consumer khác vừa tạo cùng thẻ: thử lại phép nâng có điều kiện một lần (nếu `n` của ta lớn hơn thì vẫn được áp).
      return (await advance()).count > 0 ? "UPDATED" : "SKIPPED";
    }
  }

  async applyReopened(input: ReopenedInput): Promise<ReopenedOutcome> {
    const deactivate = () =>
      prisma.contributionTaskFact.updateMany({ where: { taskId: input.taskId, completionCount: input.completionCount, active: true }, data: { active: false } });
    // Lần hoàn thành `n` chưa từng tới (lệch thứ tự) nhưng đã có fact của lần cũ: nâng lên `n` ở trạng thái đã mở lại.
    const placeholder = () =>
      prisma.contributionTaskFact.updateMany({
        where: { taskId: input.taskId, completionCount: { lt: input.completionCount } },
        data: { completionCount: input.completionCount, active: false },
      });
    const apply = async (): Promise<ReopenedOutcome | null> => {
      if ((await deactivate()).count > 0) return "DEACTIVATED";
      if ((await placeholder()).count > 0) return "PLACEHOLDER";
      return null;
    };

    const applied = await apply();
    if (applied) return applied;
    if (await prisma.contributionTaskFact.findUnique({ where: { taskId: input.taskId }, select: { id: true } })) return "SKIPPED";
    try {
      await prisma.contributionTaskFact.create({
        data: {
          taskId: input.taskId,
          boardId: input.boardId,
          workspaceId: input.workspaceId,
          assigneeIds: input.assigneeIds,
          storyPoints: null,
          dueDate: null,
          completedAt: input.reopenedAt,
          completionCount: input.completionCount,
          active: false,
          reviewApproved: null,
        },
      });
      return "PLACEHOLDER";
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      return (await apply()) ?? "SKIPPED";
    }
  }

  async insertReviewFact(fact: ReviewFact): Promise<boolean> {
    if (await prisma.contributionReviewFact.findUnique({ where: { reviewId: fact.reviewId }, select: { id: true } })) return false;
    try {
      await prisma.contributionReviewFact.create({
        data: {
          reviewId: fact.reviewId,
          taskId: fact.taskId,
          boardId: fact.boardId,
          workspaceId: fact.workspaceId,
          reviewerId: fact.reviewerId,
          assigneeIds: fact.assigneeIds,
          status: fact.status,
          score10: fact.score10,
          submittedAt: fact.submittedAt,
        },
      });
      return true;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return false;
      throw err;
    }
  }

  async listActiveTaskFacts(boardId: string): Promise<TaskFact[]> {
    const rows = await prisma.contributionTaskFact.findMany({ where: { boardId, active: true }, orderBy: { completedAt: "asc" }, take: TASK_FACT_SCAN_MAX });
    return rows.map(toTaskFact);
  }

  async listReviewFacts(boardId: string): Promise<ReviewFact[]> {
    const rows = await prisma.contributionReviewFact.findMany({ where: { boardId }, orderBy: { submittedAt: "asc" }, take: REVIEW_FACT_SCAN_MAX });
    return rows.map(toReviewFact);
  }

  async listMemberTaskFacts(boardId: string, userId: string, range: FactRange, cursor: MemberTaskCursor | null, limit: number): Promise<MemberTaskPage> {
    const completedAt = dateRange(range);
    const rows = await prisma.contributionTaskFact.findMany({
      where: {
        boardId,
        active: true,
        assigneeIds: { has: userId },
        ...(completedAt && { completedAt }),
        ...(cursor && { OR: [{ completedAt: { lt: cursor.at } }, { completedAt: cursor.at, taskId: { lt: cursor.taskId } }] }),
      },
      orderBy: [{ completedAt: "desc" }, { taskId: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit).map(toTaskFact);
    const last = page[page.length - 1];
    return { items: page, nextCursor: rows.length > limit && last ? { at: last.completedAt, taskId: last.taskId } : null };
  }

  async listReviewFactsForTasks(boardId: string, taskIds: readonly string[], range: FactRange): Promise<ReviewFact[]> {
    if (taskIds.length === 0) return [];
    const submittedAt = dateRange(range);
    const rows = await prisma.contributionReviewFact.findMany({ where: { boardId, taskId: { in: [...taskIds] }, ...(submittedAt && { submittedAt }) } });
    return rows.map(toReviewFact);
  }

  async findTaskFacts(taskIds: readonly string[]): Promise<TaskFact[]> {
    if (taskIds.length === 0) return [];
    const rows = await prisma.contributionTaskFact.findMany({ where: { taskId: { in: [...taskIds] } } });
    return rows.map(toTaskFact);
  }

  async deactivate(taskIds: readonly string[]): Promise<number> {
    if (taskIds.length === 0) return 0;
    return (await prisma.contributionTaskFact.updateMany({ where: { taskId: { in: [...taskIds] }, active: true }, data: { active: false } })).count;
  }

  async countBoardFacts(boardId: string): Promise<{ tasks: number; reviews: number }> {
    const [tasks, reviews] = await Promise.all([
      prisma.contributionTaskFact.count({ where: { boardId, active: true } }),
      prisma.contributionReviewFact.count({ where: { boardId } }),
    ]);
    return { tasks, reviews };
  }
}
