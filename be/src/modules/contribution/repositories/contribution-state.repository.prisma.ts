import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";
import type { BoardState } from "../entities/contribution.interface";
import type { IContributionStateRepository } from "./contribution-state.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type StateRecord = Prisma.ContributionBoardStateGetPayload<Record<string, never>>;

const toState = (r: StateRecord): BoardState => ({
  boardId: r.boardId,
  workspaceId: r.workspaceId,
  factsVersion: r.factsVersion,
  computedVersion: r.computedVersion,
  computedAt: r.computedAt ?? null,
  configVersion: r.configVersion,
  configChangedAt: r.configChangedAt ?? null,
  configChangedBy: r.configChangedBy ?? null,
  previousWeights: (r.previousWeights as ContributionWeights | null) ?? null,
  defaultsSnapshot: (r.defaultsSnapshot as ContributionConfigValue | null) ?? null,
  activityDirtyAt: r.activityDirtyAt ?? null,
  activityRefreshedAt: r.activityRefreshedAt ?? null,
  snapshotTimezone: r.snapshotTimezone ?? null,
  activityTimezone: r.activityTimezone ?? null,
  updatedAt: r.updatedAt,
});

export class PrismaContributionStateRepository implements IContributionStateRepository {
  async get(boardId: string): Promise<BoardState | null> {
    const row = await prisma.contributionBoardState.findUnique({ where: { boardId } });
    return row ? toState(row) : null;
  }

  async ensure(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<BoardState> {
    const existing = await this.get(boardId);
    if (existing) return existing;
    try {
      // Ghi null TƯỜNG MINH cho trường về sau lọc bằng `{ field: null }`/`not: null` (Prisma+Mongo: trường vắng ≠ null).
      const created = await prisma.contributionBoardState.create({
        data: {
          boardId,
          workspaceId,
          factsVersion: 0,
          computedVersion: 0,
          computedAt: null,
          configVersion: 0,
          configChangedAt: null,
          configChangedBy: null,
          previousWeights: null,
          defaultsSnapshot: defaults as unknown as Prisma.InputJsonValue,
          activityDirtyAt: null,
          activityRefreshedAt: null,
          snapshotTimezone: null,
          activityTimezone: null,
        },
      });
      return toState(created);
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      const again = await this.get(boardId);
      if (!again) throw err;
      return again;
    }
  }

  async bumpFactsVersion(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<number> {
    const inc = () => prisma.contributionBoardState.updateMany({ where: { boardId }, data: { factsVersion: { increment: 1 } } });
    if ((await inc()).count === 0) {
      await this.ensure(boardId, workspaceId, defaults);
      await inc();
    }
    const state = await prisma.contributionBoardState.findUnique({ where: { boardId }, select: { factsVersion: true } });
    return state?.factsVersion ?? 0;
  }

  async markComputed(boardId: string, version: number, at: Date, timezone: string): Promise<void> {
    await prisma.contributionBoardState.updateMany({
      where: { boardId, computedVersion: { lte: version } },
      data: { computedVersion: version, computedAt: at, snapshotTimezone: timezone },
    });
  }

  async changeConfig(boardId: string, expectedVersion: number, patch: { at: Date; by: string; previousWeights: ContributionWeights }, tx?: TxHandle): Promise<boolean> {
    const result = await (tx ?? prisma).contributionBoardState.updateMany({
      where: { boardId, configVersion: expectedVersion },
      data: {
        configVersion: { increment: 1 },
        configChangedAt: patch.at,
        configChangedBy: patch.by,
        previousWeights: patch.previousWeights as unknown as Prisma.InputJsonValue,
      },
    });
    return result.count > 0;
  }

  async markActivityDirty(boardId: string, workspaceId: string, defaults: ContributionConfigValue, at: Date): Promise<void> {
    const set = () => prisma.contributionBoardState.updateMany({ where: { boardId }, data: { activityDirtyAt: at } });
    if ((await set()).count === 0) {
      await this.ensure(boardId, workspaceId, defaults);
      await set();
    }
  }

  async listDirty(limit: number): Promise<BoardState[]> {
    const rows = await prisma.contributionBoardState.findMany({ where: { activityDirtyAt: { not: null } }, orderBy: { activityDirtyAt: "asc" }, take: limit });
    return rows.map(toState);
  }

  async clearActivityDirty(boardId: string, seenAt: Date): Promise<void> {
    await prisma.contributionBoardState.updateMany({ where: { boardId, activityDirtyAt: { lte: seenAt } }, data: { activityDirtyAt: null } });
  }

  async setActivityRefreshed(boardId: string, at: Date, timezone?: string): Promise<void> {
    await prisma.contributionBoardState.updateMany({ where: { boardId }, data: { activityRefreshedAt: at, ...(timezone !== undefined && { activityTimezone: timezone }) } });
  }

  async listByWorkspace(workspaceId: string): Promise<BoardState[]> {
    const rows = await prisma.contributionBoardState.findMany({ where: { workspaceId } });
    return rows.map(toState);
  }

  async listPage(afterBoardId: string | null, limit: number): Promise<BoardState[]> {
    const rows = await prisma.contributionBoardState.findMany({ where: afterBoardId ? { boardId: { gt: afterBoardId } } : {}, orderBy: { boardId: "asc" }, take: limit });
    return rows.map(toState);
  }
}
