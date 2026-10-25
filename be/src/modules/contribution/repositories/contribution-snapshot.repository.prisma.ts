import type { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import type { ContributionWeights } from "../../../core/constants/contribution";
import type { ContributionComponents, ContributionSnapshotRow } from "../entities/contribution.interface";
import type { IContributionSnapshotRepository } from "./contribution-snapshot.repository.interface";

type SnapshotRecord = Prisma.ContributionSnapshotGetPayload<Record<string, never>>;

const toRow = (r: SnapshotRecord): ContributionSnapshotRow => ({
  workspaceId: r.workspaceId,
  boardId: r.boardId,
  userId: r.userId,
  periodKey: r.periodKey,
  storyPointsDone: r.storyPointsDone,
  tasksDone: r.tasksDone,
  unestimatedTasks: r.unestimatedTasks,
  tasksWithDue: r.tasksWithDue,
  tasksOnTime: r.tasksOnTime,
  tasksLate: r.tasksLate,
  reviewCount: r.reviewCount,
  peerScoreAvg: r.peerScoreAvg ?? null,
  components: r.components as unknown as ContributionComponents,
  weightsUsed: r.weightsUsed as unknown as ContributionWeights,
  score: r.score,
  share: r.share,
  teamTasksDone: r.teamTasksDone,
  teamStoryPoints: r.teamStoryPoints,
  formulaVersion: r.formulaVersion,
  computedAt: r.computedAt,
});

const toCreate = (r: ContributionSnapshotRow): Prisma.ContributionSnapshotCreateManyInput => ({
  workspaceId: r.workspaceId,
  boardId: r.boardId,
  userId: r.userId,
  periodKey: r.periodKey,
  storyPointsDone: r.storyPointsDone,
  tasksDone: r.tasksDone,
  unestimatedTasks: r.unestimatedTasks,
  tasksWithDue: r.tasksWithDue,
  tasksOnTime: r.tasksOnTime,
  tasksLate: r.tasksLate,
  reviewCount: r.reviewCount,
  // Ghi null tường minh (Prisma+Mongo: trường vắng ≠ null).
  peerScoreAvg: r.peerScoreAvg,
  components: r.components as unknown as Prisma.InputJsonValue,
  score: r.score,
  share: r.share,
  weightsUsed: r.weightsUsed as unknown as Prisma.InputJsonValue,
  teamTasksDone: r.teamTasksDone,
  teamStoryPoints: r.teamStoryPoints,
  formulaVersion: r.formulaVersion,
  computedAt: r.computedAt,
});

export class PrismaContributionSnapshotRepository implements IContributionSnapshotRepository {
  async replaceForBoard(boardId: string, rows: readonly ContributionSnapshotRow[]): Promise<void> {
    await withTransaction(async (tx) => {
      await tx.contributionSnapshot.deleteMany({ where: { boardId } });
      if (rows.length > 0) await tx.contributionSnapshot.createMany({ data: rows.map(toCreate) });
    });
  }

  async listByPeriod(boardId: string, periodKey: string): Promise<ContributionSnapshotRow[]> {
    const rows = await prisma.contributionSnapshot.findMany({ where: { boardId, periodKey } });
    return rows.map(toRow);
  }

  async listAllPeriodByUser(userId: string): Promise<ContributionSnapshotRow[]> {
    const rows = await prisma.contributionSnapshot.findMany({ where: { userId, periodKey: "ALL" } });
    return rows.map(toRow);
  }
}
