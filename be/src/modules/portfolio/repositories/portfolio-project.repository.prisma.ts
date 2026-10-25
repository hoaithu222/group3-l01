import type { PortfolioProject as PrismaProject } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PortfolioProject, PortfolioSnapshot } from "../entities/portfolio.interface";
import type { IPortfolioProjectRepository, NewPortfolioProject, ProjectPatch } from "./portfolio-project.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

const toSnapshot = (s: PrismaProject["snapshot"]): PortfolioSnapshot => ({
  tasksDone: s.tasksDone,
  storyPointsX10: s.storyPointsX10,
  onTimeRatePct: s.onTimeRatePct ?? null,
  contributionPctX10: s.contributionPctX10 ?? null,
  contributionShareX10: s.contributionShareX10 ?? null,
  peerReviewAvgX10: s.peerReviewAvgX10 ?? null,
  filesUploaded: s.filesUploaded,
  teammatesCount: s.teammatesCount,
  namedTeammates: [...s.namedTeammates],
  skillBadges: s.skillBadges.map((b) => ({ skillId: b.skillId, code: b.code, name: b.name, icon: b.icon, unlockedAt: b.unlockedAt })),
});

export const toProject = (r: PrismaProject): PortfolioProject => ({
  id: r.id,
  portfolioId: r.portfolioId,
  userId: r.userId,
  workspaceId: r.workspaceId,
  title: r.title,
  summary: r.summary ?? null,
  role: r.role ?? null,
  periodFrom: r.periodFrom ?? null,
  periodTo: r.periodTo ?? null,
  highlights: [...r.highlights],
  coverAssetId: r.coverAssetId ?? null,
  visible: r.visible,
  order: r.order,
  showTeammates: r.showTeammates,
  snapshot: toSnapshot(r.snapshot),
  snapshotAt: r.snapshotAt,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const dbOf = (tx?: TxHandle) => tx ?? prisma;

export class PrismaPortfolioProjectRepository implements IPortfolioProjectRepository {
  async findById(id: string, tx?: TxHandle): Promise<PortfolioProject | null> {
    const r = await dbOf(tx).portfolioProject.findUnique({ where: { id } });
    return r ? toProject(r) : null;
  }

  async listByPortfolio(portfolioId: string, tx?: TxHandle): Promise<PortfolioProject[]> {
    const rows = await dbOf(tx).portfolioProject.findMany({ where: { portfolioId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
    return rows.map(toProject);
  }

  async count(portfolioId: string, tx?: TxHandle): Promise<number> {
    return dbOf(tx).portfolioProject.count({ where: { portfolioId } });
  }

  async create(input: NewPortfolioProject, tx?: TxHandle): Promise<PortfolioProject> {
    const r = await mapUnique(`PortfolioProject:${input.portfolioId}:${input.workspaceId}`, () =>
      dbOf(tx).portfolioProject.create({
        data: {
          portfolioId: input.portfolioId,
          userId: input.userId,
          workspaceId: input.workspaceId,
          title: input.title,
          summary: null,
          role: null,
          periodFrom: null,
          periodTo: null,
          highlights: [],
          coverAssetId: null,
          visible: true,
          order: input.order,
          showTeammates: input.showTeammates,
          snapshot: input.snapshot,
          snapshotAt: input.snapshotAt,
        },
      })
    );
    return toProject(r);
  }

  async updateContent(id: string, expectedVersion: number, patch: ProjectPatch, tx?: TxHandle): Promise<PortfolioProject | null> {
    const res = await dbOf(tx).portfolioProject.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.summary !== undefined && { summary: patch.summary }),
        ...(patch.role !== undefined && { role: patch.role }),
        ...(patch.periodFrom !== undefined && { periodFrom: patch.periodFrom }),
        ...(patch.periodTo !== undefined && { periodTo: patch.periodTo }),
        ...(patch.highlights !== undefined && { highlights: { set: patch.highlights } }),
        ...(patch.coverAssetId !== undefined && { coverAssetId: patch.coverAssetId }),
        ...(patch.visible !== undefined && { visible: patch.visible }),
        ...(patch.showTeammates !== undefined && { showTeammates: patch.showTeammates }),
        version: { increment: 1 },
      },
    });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async updateSnapshot(id: string, snapshot: PortfolioSnapshot, at: Date, tx?: TxHandle): Promise<PortfolioProject | null> {
    const res = await dbOf(tx).portfolioProject.updateMany({ where: { id }, data: { snapshot: { set: snapshot }, snapshotAt: at } });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async setOrders(portfolioId: string, orderedIds: readonly string[], tx?: TxHandle): Promise<void> {
    const db = dbOf(tx);
    for (const [index, id] of orderedIds.entries()) await db.portfolioProject.updateMany({ where: { id, portfolioId }, data: { order: index } });
  }

  async delete(id: string, tx?: TxHandle): Promise<boolean> {
    return (await dbOf(tx).portfolioProject.deleteMany({ where: { id } })).count === 1;
  }

  async deleteByPortfolio(portfolioId: string, tx?: TxHandle): Promise<number> {
    return (await dbOf(tx).portfolioProject.deleteMany({ where: { portfolioId } })).count;
  }
}
