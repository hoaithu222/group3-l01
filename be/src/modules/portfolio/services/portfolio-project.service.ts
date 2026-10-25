import { LIMITS } from "../../../core/constants/limits";
import { AppError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { decodeOffsetCursor, encodeOffsetCursor } from "../../../core/utils/cursor";
import type { UpdateProjectDto } from "../dtos";
import type { Portfolio, PortfolioProject } from "../entities/portfolio.interface";
import type { IPortfolioProjectRepository, ProjectPatch } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioSourceRepository } from "../repositories/portfolio-source.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import { SnapshotUnavailableError, type PortfolioSnapshotService } from "./portfolio-snapshot.service";
import { presentProject, type PortfolioProjectDto } from "./portfolio.presenter";
import { portfolioErrors } from "./portfolio.errors";
import type { IPortfolioAssets } from "./portfolio.ports";
import type { PortfolioService } from "./portfolio.service";

export interface ProjectServiceDeps {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  source: IPortfolioSourceRepository;
  snapshots: PortfolioSnapshotService;
  assets: IPortfolioAssets;
  tx: ITxRunner;
  portfolio: Pick<PortfolioService, "ensure">;
  now: () => Date;
}

export interface EligibleWorkspaceDto {
  workspaceId: string;
  name: string;
  archived: boolean;
  /** Người dùng không còn là thành viên ACTIVE — app hiện nhãn "Đã rời nhóm". */
  left: boolean;
  myTasksDone: number;
  alreadyAdded: boolean;
}

export interface EligiblePage {
  items: EligibleWorkspaceDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

const unavailable = (): AppError => new AppError("Chưa đọc được số liệu đóng góp, vui lòng thử lại sau", 503, ErrorCode.SYS_503);
const clip = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, n).trimEnd());

/** Dự án hiển thị trong portfolio: chọn nhóm đủ điều kiện, sửa nội dung, ẩn/hiện, sắp xếp, làm mới số liệu. Chỉ chủ hồ sơ thao tác được (404 với người khác). */
export class PortfolioProjectService {
  constructor(private readonly d: ProjectServiceDeps) {}

  /** Nhóm có ≥ 1 thẻ hoàn thành được tính cho tôi — kể cả đã rời nhóm / nhóm đã lưu trữ (không cần quyền đọc hiện tại: chỉ công khai số liệu của chính mình). */
  async eligibleWorkspaces(userId: string, cursor: string | undefined, limit: number): Promise<EligiblePage> {
    const rows = (await this.d.source.eligibleWorkspaces(userId)).sort((a, b) => b.tasksDone - a.tasksDone || a.workspaceId.localeCompare(b.workspaceId));
    const ids = rows.map((r) => r.workspaceId);
    const pf = await this.d.portfolios.findByUserId(userId);
    const [workspaces, members, added] = await Promise.all([
      this.d.source.workspaces(ids),
      this.d.source.activeMemberOf(userId, ids),
      pf ? this.d.projects.listByPortfolio(pf.id) : Promise.resolve([] as PortfolioProject[]),
    ]);
    const addedIds = new Set(added.map((p) => p.workspaceId));
    const items = rows.flatMap((r) => {
      const ws = workspaces.get(r.workspaceId);
      return ws ? [{ workspaceId: r.workspaceId, name: ws.name, archived: ws.archived, left: !members.has(r.workspaceId), myTasksDone: r.tasksDone, alreadyAdded: addedIds.has(r.workspaceId) }] : [];
    });
    const start = decodeOffsetCursor(cursor);
    const page = items.slice(start, start + limit);
    const hasMore = start + limit < items.length;
    return { items: page, nextCursor: hasMore ? encodeOffsetCursor(start + limit) : null, hasMore };
  }

  async add(userId: string, workspaceId: string): Promise<PortfolioProjectDto> {
    const pf = await this.d.portfolio.ensure(userId);
    if ((await this.d.projects.count(pf.id)) >= LIMITS.portfolio.projectsMax) throw portfolioErrors.tooManyProjects(LIMITS.portfolio.projectsMax);
    if ((await this.d.projects.listByPortfolio(pf.id)).some((p) => p.workspaceId === workspaceId)) throw portfolioErrors.duplicateProject();
    const snapshot = await this.capture(userId, workspaceId, { showTeammates: false });
    if (!snapshot) throw portfolioErrors.notEligible();
    const ws = (await this.d.source.workspaces([workspaceId])).get(workspaceId);
    const now = this.d.now();
    try {
      const created = await this.d.tx.run(async (tx) => {
        // Ghi hồ sơ TRƯỚC: hai lượt thêm đồng thời cùng ghi một tài liệu → write-conflict → lượt sau chạy lại và thấy đủ số dự án (không vượt trần).
        await this.d.portfolios.touch(pf.id, now, tx);
        if ((await this.d.projects.count(pf.id, tx)) >= LIMITS.portfolio.projectsMax) throw portfolioErrors.tooManyProjects(LIMITS.portfolio.projectsMax);
        const order = (await this.d.projects.listByPortfolio(pf.id, tx)).reduce((max, p) => Math.max(max, p.order), -1) + 1;
        return this.d.projects.create(
          { portfolioId: pf.id, userId, workspaceId, title: this.titleOf(ws?.name), order, showTeammates: false, snapshot, snapshotAt: now },
          tx
        );
      });
      return presentProject(created);
    } catch (err) {
      if (err instanceof UniqueViolationError) throw portfolioErrors.duplicateProject();
      throw err;
    }
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto): Promise<PortfolioProjectDto> {
    const { pf, project } = await this.own(userId, projectId);
    if (dto.expectedVersion !== project.version) throw new VersionConflictError(project.version);
    const from = dto.periodFrom === undefined ? project.periodFrom : dto.periodFrom;
    const to = dto.periodTo === undefined ? project.periodTo : dto.periodTo;
    if (from && to && from > to) throw new ValidationError("Thời gian bắt đầu phải trước thời gian kết thúc");

    const coverChanged = dto.coverAssetId !== undefined && dto.coverAssetId !== project.coverAssetId;
    if (coverChanged && dto.coverAssetId) await this.d.assets.assertUsableImage(userId, dto.coverAssetId);
    const patch: ProjectPatch = {
      title: dto.title,
      summary: dto.summary,
      role: dto.role,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      highlights: dto.highlights,
      coverAssetId: dto.coverAssetId,
      visible: dto.visible,
      showTeammates: dto.showTeammates,
    };
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.projects.updateContent(projectId, dto.expectedVersion, patch, tx);
      if (!u) return null;
      if (coverChanged) {
        if (dto.coverAssetId) await this.d.assets.replace(tx, { userId, assetId: dto.coverAssetId, targetId: projectId });
        else await this.d.assets.detachAll(tx, projectId);
      }
      await this.d.portfolios.touch(pf.id, this.d.now(), tx);
      return u;
    });
    if (!updated) throw new VersionConflictError((await this.d.projects.findById(projectId))?.version ?? project.version);
    if (dto.showTeammates !== undefined && dto.showTeammates !== project.showTeammates) {
      // Đổi công tắc đồng đội: chỉ tính lại phần đồng đội (rẻ) — không đụng số liệu khác nên không lách được giới hạn "Làm mới".
      const snap = await this.d.snapshots.recaptureTeammates(userId, project.workspaceId, dto.showTeammates, updated.snapshot);
      return presentProject((await this.d.projects.updateSnapshot(projectId, snap, updated.snapshotAt)) ?? updated);
    }
    return presentProject(updated);
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const { pf } = await this.own(userId, projectId);
    await this.d.tx.run(async (tx) => {
      await this.d.projects.delete(projectId, tx);
      await this.d.assets.detachAll(tx, projectId);
      await this.d.portfolios.touch(pf.id, this.d.now(), tx);
    });
  }

  /** `projectIds` PHẢI đúng bằng tập dự án hiện có (thiếu/thừa/trùng → 400) — thứ tự mới là chỉ số trong mảng. */
  async reorder(userId: string, projectIds: string[]): Promise<PortfolioProjectDto[]> {
    const pf = await this.d.portfolios.findByUserId(userId);
    if (!pf) throw portfolioErrors.notFound();
    const current = await this.d.projects.listByPortfolio(pf.id);
    const wanted = new Set(projectIds);
    if (wanted.size !== projectIds.length || projectIds.length !== current.length || current.some((p) => !wanted.has(p.id))) {
      throw new ValidationError("Danh sách dự án không khớp với hồ sơ hiện tại (thiếu, thừa hoặc trùng)");
    }
    await this.d.tx.run(async (tx) => {
      await this.d.projects.setOrders(pf.id, projectIds, tx);
      await this.d.portfolios.touch(pf.id, this.d.now(), tx);
    });
    return (await this.d.projects.listByPortfolio(pf.id)).map(presentProject);
  }

  /** "Làm mới số liệu" — chụp lại toàn bộ snapshot (giới hạn `refreshPerHour` do middleware ở route, `PORT_007`). */
  async refresh(userId: string, projectId: string): Promise<PortfolioProjectDto> {
    const { pf, project } = await this.own(userId, projectId);
    const snapshot = await this.capture(userId, project.workspaceId, { showTeammates: project.showTeammates, previous: project.snapshot });
    if (!snapshot) throw portfolioErrors.notEligible();
    const now = this.d.now();
    const updated = await this.d.projects.updateSnapshot(projectId, snapshot, now);
    if (!updated) throw portfolioErrors.projectNotFound();
    await this.d.portfolios.touch(pf.id, now);
    return presentProject(updated);
  }

  private titleOf(workspaceName: string | undefined): string {
    const name = (workspaceName ?? "").trim();
    return name.length >= LIMITS.portfolio.projectTitleMin ? clip(name, LIMITS.portfolio.projectTitleMax) : "Dự án";
  }

  private async capture(userId: string, workspaceId: string, opts: Parameters<PortfolioSnapshotService["capture"]>[2]) {
    try {
      return await this.d.snapshots.capture(userId, workspaceId, opts);
    } catch (err) {
      if (err instanceof SnapshotUnavailableError) throw unavailable();
      throw err;
    }
  }

  private async own(userId: string, projectId: string): Promise<{ pf: Portfolio; project: PortfolioProject }> {
    const pf = await this.d.portfolios.findByUserId(userId);
    const project = pf ? await this.d.projects.findById(projectId) : null;
    if (!pf || !project || project.portfolioId !== pf.id) throw portfolioErrors.projectNotFound();
    return { pf, project };
  }
}
