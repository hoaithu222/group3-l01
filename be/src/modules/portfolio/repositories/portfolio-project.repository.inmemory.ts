/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import type { PortfolioProject, PortfolioSnapshot } from "../entities/portfolio.interface";
import type { IPortfolioProjectRepository, NewPortfolioProject, ProjectPatch } from "./portfolio-project.repository.interface";
import { UniqueViolationError } from "./tx";

const copySnapshot = (s: PortfolioSnapshot): PortfolioSnapshot => ({ ...s, namedTeammates: [...s.namedTeammates], skillBadges: s.skillBadges.map((b) => ({ ...b })) });
const copy = (p: PortfolioProject): PortfolioProject => ({ ...p, highlights: [...p.highlights], snapshot: copySnapshot(p.snapshot) });

export class InMemoryPortfolioProjectRepository implements IPortfolioProjectRepository {
  readonly rows = new Map<string, PortfolioProject>();
  now: () => Date = () => new Date();

  async findById(id: string): Promise<PortfolioProject | null> {
    const r = this.rows.get(id);
    return r ? copy(r) : null;
  }

  async listByPortfolio(portfolioId: string): Promise<PortfolioProject[]> {
    return [...this.rows.values()]
      .filter((p) => p.portfolioId === portfolioId)
      .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime())
      .map(copy);
  }

  async count(portfolioId: string): Promise<number> {
    return [...this.rows.values()].filter((p) => p.portfolioId === portfolioId).length;
  }

  async create(input: NewPortfolioProject): Promise<PortfolioProject> {
    if ([...this.rows.values()].some((p) => p.portfolioId === input.portfolioId && p.workspaceId === input.workspaceId)) {
      throw new UniqueViolationError(`PortfolioProject:${input.portfolioId}:${input.workspaceId}`);
    }
    const at = this.now();
    const row: PortfolioProject = {
      id: newObjectId(),
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
      snapshot: copySnapshot(input.snapshot),
      snapshotAt: input.snapshotAt,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(row.id, row);
    return copy(row);
  }

  async updateContent(id: string, expectedVersion: number, patch: ProjectPatch): Promise<PortfolioProject | null> {
    const r = this.rows.get(id);
    if (!r || r.version !== expectedVersion) return null;
    if (patch.title !== undefined) r.title = patch.title;
    if (patch.summary !== undefined) r.summary = patch.summary;
    if (patch.role !== undefined) r.role = patch.role;
    if (patch.periodFrom !== undefined) r.periodFrom = patch.periodFrom;
    if (patch.periodTo !== undefined) r.periodTo = patch.periodTo;
    if (patch.highlights !== undefined) r.highlights = [...patch.highlights];
    if (patch.coverAssetId !== undefined) r.coverAssetId = patch.coverAssetId;
    if (patch.visible !== undefined) r.visible = patch.visible;
    if (patch.showTeammates !== undefined) r.showTeammates = patch.showTeammates;
    r.version += 1;
    r.updatedAt = this.now();
    return copy(r);
  }

  async updateSnapshot(id: string, snapshot: PortfolioSnapshot, at: Date): Promise<PortfolioProject | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.snapshot = copySnapshot(snapshot);
    r.snapshotAt = at;
    r.updatedAt = this.now();
    return copy(r);
  }

  async setOrders(portfolioId: string, orderedIds: readonly string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const r = this.rows.get(id);
      if (r && r.portfolioId === portfolioId) r.order = index;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async deleteByPortfolio(portfolioId: string): Promise<number> {
    const ids = [...this.rows.values()].filter((p) => p.portfolioId === portfolioId).map((p) => p.id);
    ids.forEach((id) => this.rows.delete(id));
    return ids.length;
  }
}
