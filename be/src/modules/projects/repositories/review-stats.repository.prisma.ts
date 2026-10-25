import type { IReviewStatsRepository, RawReviewStats } from "./task-review.repository.interface";
import { db } from "./prisma-tx";

/** Số liệu chấm chéo THÔ cho admin (`GET /admin/workspaces/:id/review-stats`) — chỉ ĐẾM, không đọc tên/điểm/nhận xét. */
export class PrismaReviewStatsRepository implements IReviewStatsRepository {
  async forWorkspace(workspaceId: string, since: Date, overdueBefore: Date, sampleMax: number): Promise<RawReviewStats> {
    const client = db();
    const inPeriod = { workspaceId, openedAt: { gte: since } };
    const [openRounds, pendingReviews, overdue, roundsInPeriod, autoApprovedRounds, waivedRounds, durations, byBoard] = await Promise.all([
      client.taskReviewRound.count({ where: { workspaceId, status: "OPEN" } }),
      client.taskReview.count({ where: { workspaceId, status: "PENDING" } }),
      client.taskReview.count({ where: { workspaceId, status: "PENDING", assignedAt: { lt: overdueBefore } } }),
      client.taskReviewRound.count({ where: inPeriod }),
      client.taskReviewRound.count({ where: { ...inPeriod, autoApproved: true } }),
      client.taskReviewRound.count({ where: { ...inPeriod, status: "WAIVED" } }),
      client.taskReview.findMany({
        where: { workspaceId, status: { in: ["APPROVED", "REQUEST_CHANGES"] }, submittedAt: { gte: since, not: null } },
        select: { assignedAt: true, submittedAt: true },
        orderBy: { submittedAt: "desc" },
        take: sampleMax,
      }),
      client.taskReviewRound.groupBy({ by: ["boardId"], where: { workspaceId, status: "OPEN" }, _count: { _all: true } }),
    ]);
    return {
      openRounds,
      pendingReviews,
      overdue,
      roundsInPeriod,
      autoApprovedRounds,
      waivedRounds,
      submitDurations: durations.flatMap((d) => (d.submittedAt ? [{ assignedAt: d.assignedAt, submittedAt: d.submittedAt }] : [])),
      openRoundsByBoard: new Map(byBoard.map((b) => [b.boardId, b._count._all])),
    };
  }
}
