import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { ReportPort } from "../../../shared/ports/report.port";
import type { SkillBadgeReadPort } from "../../career/public";
import type { TakedownDto } from "../dtos";
import { PORTFOLIO_SECTION_KINDS, type Portfolio, type PortfolioProject } from "../entities/portfolio.interface";
import { safeHttpsUrl } from "../entities/portfolio.rules";
import { PORTFOLIO_NOTIFICATION_TYPES } from "../notifications/portfolio.notification-types";
import type { IPortfolioBuildRepository } from "../repositories/portfolio-build.repository.interface";
import type { IPortfolioProjectRepository } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { IPortfolioNotifier, IPortfolioOutbox, ITxRunner } from "../repositories/tx";
import type { PortfolioBuildScheduler } from "./portfolio-build.scheduler";
import { purgeRow, unpublishedRow } from "./portfolio-outbox-rows";
import { emptyVisibleSections, sectionsWithContent, visibleSections, type SectionContent } from "./portfolio-view";
import { presentAdminPortfolio, presentBuild, type AdminPortfolioDto, type PortfolioBuildDto } from "./portfolio.presenter";
import { portfolioErrors } from "./portfolio.errors";
import type { IPortfolioAudit, IPortfolioCache } from "./portfolio.ports";

export interface PublishServiceDeps {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  builds: IPortfolioBuildRepository;
  career: Pick<SkillBadgeReadPort, "activeBadges" | "career">;
  scheduler: PortfolioBuildScheduler;
  tx: ITxRunner;
  outbox: IPortfolioOutbox;
  notifier: IPortfolioNotifier;
  cache: IPortfolioCache;
  audit: IPortfolioAudit;
  reports: Pick<ReportPort, "closeOpenByTarget">;
  now: () => Date;
  baseUrl: () => string;
}

const MINUTE_MS = 60_000;

/** Công khai / ngừng công khai / link người khác, cùng thao tác vận hành gỡ vi phạm và mở lại. */
export class PortfolioPublishService {
  constructor(private readonly d: PublishServiceDeps) {}

  /** `202 { buildId, buildVersion }` — dựng trang chạy nền (job `portfolio.build`); tiến độ qua socket + `GET /me/portfolio/builds/latest`. */
  async publish(userId: string, expectedVersion: number): Promise<{ buildId: string; buildVersion: number }> {
    const pf = await this.d.portfolios.findByUserId(userId);
    const sections = [...PORTFOLIO_SECTION_KINDS];
    if (!pf) throw portfolioErrors.emptyPortfolio({ emptySections: sections, visibleSections: sections });
    if (pf.takenDownAt) throw portfolioErrors.takenDown();
    if (pf.version !== expectedVersion) throw new VersionConflictError(pf.version);
    await this.assertHasContent(pf);

    const build = await this.d.tx.run(async (tx) => {
      // Kiểm TRONG transaction: lượt chạy lại sau write-conflict thấy build vừa xếp của lượt đua → `PORT_009`.
      if (await this.d.builds.hasInFlight(pf.id, tx)) throw portfolioErrors.buildInProgress();
      return this.d.scheduler.schedule(tx, { portfolioId: pf.id, portfolioVersion: pf.version, trigger: "PUBLISH", createdBy: userId, expectedVersion });
    });
    if (!build) {
      const cur = await this.d.portfolios.findById(pf.id);
      if (cur?.takenDownAt) throw portfolioErrors.takenDown();
      throw new VersionConflictError(cur?.version ?? pf.version);
    }
    return { buildId: build.id, buildVersion: build.buildVersion };
  }

  async unpublish(userId: string): Promise<{ status: "UNPUBLISHED" }> {
    const pf = await this.d.portfolios.findByUserId(userId);
    if (!pf) throw portfolioErrors.notFound();
    const now = this.d.now();
    await this.d.tx.run(async (tx) => {
      if (!(await this.d.portfolios.markUnpublished(pf.id, now, tx))) throw portfolioErrors.notPublished();
      // Build đang chờ/đang dựng bị đóng để KHÔNG "sống lại" trang sau khi người dùng đã ngừng công khai.
      await this.d.builds.failInFlight(pf.id, "Đã ngừng công khai", now, tx);
      await this.d.outbox.add(tx, unpublishedRow({ portfolioId: pf.id, userId, reason: "UNPUBLISH" }, now));
      if (pf.currentBuildVersion !== null) await this.d.outbox.add(tx, purgeRow(pf.id, pf.currentBuildVersion, LIMITS.portfolio.purgeDelayMinutes * MINUTE_MS, now));
    });
    await this.d.cache.del([pf.slugKey]);
    return { status: "UNPUBLISHED" };
  }

  async latestBuild(userId: string): Promise<PortfolioBuildDto | null> {
    const pf = await this.d.portfolios.findByUserId(userId);
    const latest = pf ? await this.d.builds.latest(pf.id) : null;
    return latest ? presentBuild(latest) : null;
  }

  /** Link portfolio của NGƯỜI KHÁC — chỉ khi đang công khai và không bị gỡ; ngược lại 404 (không lộ hồ sơ nháp). `portfolioId` để app gọi `POST /reports { targetType: "PORTFOLIO" }`. */
  async linkOf(targetUserId: string): Promise<{ url: string; portfolioId: string }> {
    const pf = await this.d.portfolios.findByUserId(targetUserId);
    if (!pf || pf.status !== "PUBLISHED" || pf.takenDownAt) throw portfolioErrors.notFound();
    return { url: `${this.d.baseUrl()}/${pf.slug}`, portfolioId: pf.id };
  }

  // ── Vận hành (`moderation:view|update`) ─────────────────────────────────────

  async adminGet(portfolioId: string): Promise<AdminPortfolioDto> {
    return this.present(await this.load(portfolioId));
  }

  /** Gỡ vi phạm: chặn `/p/<slug>` NGAY (404), đóng build đang chạy, xếp dọn object, thông báo chủ, audit, đóng báo cáo mở. Idempotent (đã gỡ → trả nguyên trạng). */
  async takedown(actor: AuthUser, portfolioId: string, dto: TakedownDto): Promise<AdminPortfolioDto> {
    const pf = await this.load(portfolioId);
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.portfolios.setTakedown(pf.id, actor.id, dto.reason, now, tx);
      if (!u) return null; // đã bị gỡ trước đó
      await this.d.builds.failInFlight(pf.id, "Hồ sơ đã bị gỡ", now, tx);
      if (pf.status === "PUBLISHED") {
        await this.d.outbox.add(tx, unpublishedRow({ portfolioId: pf.id, userId: pf.userId, reason: "TAKEDOWN" }, now));
        if (pf.currentBuildVersion !== null) await this.d.outbox.add(tx, purgeRow(pf.id, pf.currentBuildVersion, LIMITS.portfolio.purgeDelayMinutes * MINUTE_MS, now));
      }
      const key = `portfolio-taken-down:${pf.id}:${now.getTime()}`;
      await this.d.notifier.notify(tx, {
        type: PORTFOLIO_NOTIFICATION_TYPES.TAKEN_DOWN,
        scope: null,
        source: { type: "Portfolio", id: key },
        refs: { portfolioId: pf.id },
        recipients: [{ userId: pf.userId }],
        dedupeKey: key,
      });
      return u;
    });
    if (!updated) return this.present(pf);
    await this.d.cache.del([pf.slugKey]);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "portfolio.takedown", targetType: "Portfolio", targetId: pf.id, reason: dto.reason, metadata: { ownerId: pf.userId, slug: pf.slug, reportGroupKey: dto.reportGroupKey ?? null } });
    await this.closeReports(actor, pf.id, dto.reason);
    return this.present(updated);
  }

  /** Mở lại (KHÔNG tự công khai lại — chủ hồ sơ tự bấm Công khai). `PORT_012` khi hồ sơ không bị gỡ. */
  async restore(actor: AuthUser, portfolioId: string, reason: string): Promise<AdminPortfolioDto> {
    const pf = await this.load(portfolioId);
    const updated = await this.d.portfolios.clearTakedown(pf.id);
    if (!updated) throw portfolioErrors.notTakenDown();
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "portfolio.restore", targetType: "Portfolio", targetId: pf.id, reason, metadata: { ownerId: pf.userId, slug: pf.slug } });
    return this.present(updated);
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  private present(p: Portfolio): AdminPortfolioDto {
    return presentAdminPortfolio(p, p.status === "PUBLISHED" && !p.takenDownAt ? `${this.d.baseUrl()}/${p.slug}` : null);
  }

  private async load(portfolioId: string): Promise<Portfolio> {
    const pf = await this.d.portfolios.findById(portfolioId);
    if (!pf) throw portfolioErrors.notFound();
    return pf;
  }

  /** Báo cáo mở của đích PORTFOLIO đóng với kết quả `CONTENT_REMOVED` (best-effort: lỗi chỉ log — gỡ trang đã xong). */
  private async closeReports(actor: AuthUser, portfolioId: string, reason: string): Promise<void> {
    try {
      await this.d.reports.closeOpenByTarget({ targetType: "PORTFOLIO", targetId: portfolioId, actor: { id: actor.id, role: actor.role }, resolution: "CONTENT_REMOVED", level: "PLATFORM", reason });
    } catch (err) {
      logger.warn("[portfolio] không đóng được báo cáo sau khi gỡ", { portfolioId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** `PORT_010` khi KHÔNG có mục đang bật nào có nội dung; `details` chỉ ra mục đang bật nhưng còn trống. */
  private async assertHasContent(pf: Portfolio): Promise<void> {
    const projects = await this.d.projects.listByPortfolio(pf.id);
    const content = await this.contentOf(pf, projects);
    if (sectionsWithContent(pf.sections, content).length > 0) return;
    throw portfolioErrors.emptyPortfolio({ emptySections: emptyVisibleSections(pf.sections, content), visibleSections: visibleSections(pf.sections).map((s) => s.kind) });
  }

  private async contentOf(pf: Portfolio, projects: readonly PortfolioProject[]): Promise<SectionContent> {
    const showSkills = (await this.d.career.career(pf.userId)).visibility.showSkills;
    return {
      hasAbout: (pf.bio ?? "").trim().length > 0,
      hasProjects: projects.some((p) => p.visible),
      hasSkills: showSkills && (await this.d.career.activeBadges(pf.userId)).length > 0,
      hasContact: pf.links.some((l) => safeHttpsUrl(l.url) !== null),
    };
  }
}
