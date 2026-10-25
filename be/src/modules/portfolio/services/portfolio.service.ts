import { LIMITS } from "../../../core/constants/limits";
import { AppError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { ChangeSlugDto, UpdatePortfolioDto } from "../dtos";
import { DEFAULT_SECTIONS, DEFAULT_THEME, PORTFOLIO_ACCENTS, PORTFOLIO_TEMPLATES, type Portfolio, type PortfolioAccent, type PortfolioTemplate } from "../entities/portfolio.interface";
import type { IPortfolioBuildRepository } from "../repositories/portfolio-build.repository.interface";
import type { IPortfolioProjectRepository } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioSlugReservationRepository } from "../repositories/portfolio-slug-reservation.repository.interface";
import type { IPortfolioSourceRepository } from "../repositories/portfolio-source.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import { ACCENT_TOKENS, TEMPLATE_META } from "../templates/theme-tokens";
import type { PortfolioBuildScheduler } from "./portfolio-build.scheduler";
import type { PortfolioSlugService, SlugUnavailableReason } from "./portfolio-slug.service";
import { presentBuild, presentPortfolio, presentProject, type PortfolioDto, type PortfolioOverviewDto } from "./portfolio.presenter";
import { portfolioErrors } from "./portfolio.errors";
import type { IPortfolioAssets, IPortfolioCache, IPortfolioConfig } from "./portfolio.ports";

export interface PortfolioServiceDeps {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  builds: IPortfolioBuildRepository;
  reservations: IPortfolioSlugReservationRepository;
  slugs: PortfolioSlugService;
  source: IPortfolioSourceRepository;
  assets: IPortfolioAssets;
  tx: ITxRunner;
  scheduler: PortfolioBuildScheduler;
  cache: IPortfolioCache;
  config: IPortfolioConfig;
  now: () => Date;
  baseUrl: () => string;
}

export interface TemplateDto {
  template: PortfolioTemplate;
  name: string;
  description: string;
  dark: boolean;
  /** Ảnh xem mẫu do app đóng gói sẵn (theo `template`); BE không lưu ảnh mẫu. */
  previewImageUrl: string | null;
  accents: { accent: PortfolioAccent; name: string; color: string }[];
}

const DAY_MS = 86_400_000;

/** Hồ sơ (`GET/PUT /me/portfolio`), slug (`PUT /me/portfolio/slug`, `GET /portfolio/slug-available`), danh mục mẫu. Tạo hồ sơ LƯỜI ở lần ghi đầu tiên. */
export class PortfolioService {
  constructor(private readonly d: PortfolioServiceDeps) {}

  publicUrlOf(p: Portfolio): string | null {
    return p.status === "PUBLISHED" && !p.takenDownAt ? `${this.d.baseUrl()}/${p.slug}` : null;
  }

  async overview(userId: string): Promise<PortfolioOverviewDto> {
    const p = await this.d.portfolios.findByUserId(userId);
    if (!p) return { portfolio: null, projects: [], latestBuild: null, publicUrl: null };
    const [projects, latest, current] = await Promise.all([
      this.d.projects.listByPortfolio(p.id),
      this.d.builds.latest(p.id),
      p.currentBuildVersion === null ? Promise.resolve(null) : this.d.builds.find(p.id, p.currentBuildVersion),
    ]);
    return {
      portfolio: presentPortfolio(p, { hasUnpublishedChanges: p.status === "PUBLISHED" && current !== null && p.updatedAt > current.createdAt }),
      projects: projects.map(presentProject),
      latestBuild: latest ? presentBuild(latest) : null,
      publicUrl: this.publicUrlOf(p),
    };
  }

  /** Hồ sơ của người dùng, tạo mặc định (tên tài khoản, mẫu CLASSIC/GREEN, slug tự sinh) nếu chưa có — dùng khi thêm dự án đầu tiên. */
  async ensure(userId: string): Promise<Portfolio> {
    const existing = await this.d.portfolios.findByUserId(userId);
    if (existing) return existing;
    const name = (await this.d.source.users([userId])).get(userId)?.name.trim() ?? "";
    const displayName = name.length >= LIMITS.portfolio.displayNameMin ? name.slice(0, LIMITS.portfolio.displayNameMax) : "Người dùng";
    return this.createWith(userId, { displayName, headline: null, bio: null, avatarAssetId: null, links: [], theme: { ...DEFAULT_THEME }, seoIndexable: !(await this.d.config.defaultNoindex()) });
  }

  async update(userId: string, dto: UpdatePortfolioDto): Promise<PortfolioDto> {
    const existing = await this.d.portfolios.findByUserId(userId);
    if (!existing) {
      if (dto.expectedVersion !== 0) throw portfolioErrors.notFound();
      const created = await this.createWith(
        userId,
        { displayName: dto.displayName, headline: dto.headline, bio: dto.bio, avatarAssetId: dto.avatarAssetId, links: dto.links, theme: dto.theme, seoIndexable: dto.seoIndexable },
        dto.sections
      );
      return presentPortfolio(created, { hasUnpublishedChanges: false });
    }
    if (dto.expectedVersion !== existing.version) throw new VersionConflictError(existing.version);
    const avatarChanged = dto.avatarAssetId !== existing.avatarAssetId;
    if (avatarChanged && dto.avatarAssetId) await this.d.assets.assertUsableImage(userId, dto.avatarAssetId);
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.portfolios.updateProfile(existing.id, dto.expectedVersion, {
        displayName: dto.displayName,
        headline: dto.headline,
        bio: dto.bio,
        avatarAssetId: dto.avatarAssetId,
        links: dto.links,
        theme: dto.theme,
        sections: dto.sections,
        seoIndexable: dto.seoIndexable,
      }, tx);
      if (u && avatarChanged) {
        if (dto.avatarAssetId) await this.d.assets.replace(tx, { userId, assetId: dto.avatarAssetId, targetId: existing.id });
        else await this.d.assets.detachAll(tx, existing.id);
      }
      return u;
    });
    if (!updated) throw new VersionConflictError((await this.d.portfolios.findById(existing.id))?.version ?? existing.version);
    return presentPortfolio(updated, { hasUnpublishedChanges: updated.status === "PUBLISHED" });
  }

  async changeSlug(userId: string, dto: ChangeSlugDto): Promise<PortfolioDto> {
    const existing = await this.d.portfolios.findByUserId(userId);
    if (!existing) throw portfolioErrors.notFound();
    if (dto.expectedVersion !== existing.version) throw new VersionConflictError(existing.version);
    const slugKey = await this.d.slugs.assertUsable(dto.slug, existing.id);
    if (slugKey === existing.slugKey) return presentPortfolio(existing, { hasUnpublishedChanges: false });
    const now = this.d.now();
    let updated: Portfolio | null;
    try {
      updated = await this.d.tx.run(async (tx) => {
        const u = await this.d.portfolios.changeSlug(existing.id, dto.expectedVersion, slugKey, tx);
        if (!u) return null;
        // Slug cũ giữ `slugReserveDays` ngày: 301 sang slug mới + không ai khác lấy được. Mọi reservation cũ của hồ sơ trỏ thẳng slug mới (không chuỗi A→B→C).
        await this.d.reservations.upsert({ slugKey: existing.slugKey, portfolioId: existing.id, redirectTo: slugKey, expiresAt: new Date(now.getTime() + LIMITS.portfolio.slugReserveDays * DAY_MS) }, tx);
        await this.d.reservations.redirectAll(existing.id, slugKey, tx);
        await this.d.reservations.deleteByKey(slugKey, tx); // lấy lại slug CŨ của chính mình
        // Trang đã công khai chứa slug (canonical, đường dẫn ảnh) → dựng lại.
        if (existing.status === "PUBLISHED") await this.d.scheduler.schedule(tx, { portfolioId: existing.id, portfolioVersion: u.version, trigger: "PUBLISH", createdBy: userId });
        return u;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw portfolioErrors.slugTaken(); // đua chiếm cùng slug
      throw err;
    }
    if (!updated) throw new VersionConflictError((await this.d.portfolios.findById(existing.id))?.version ?? existing.version);
    await this.d.cache.del([existing.slugKey, slugKey]);
    return presentPortfolio(updated, { hasUnpublishedChanges: updated.status === "PUBLISHED" });
  }

  async slugAvailability(userId: string, slug: string): Promise<{ available: boolean; reason?: SlugUnavailableReason }> {
    const own = await this.d.portfolios.findByUserId(userId);
    const result = await this.d.slugs.check(slug, own?.id ?? null);
    return result.ok ? { available: true } : { available: false, reason: result.reason };
  }

  templates(): TemplateDto[] {
    return PORTFOLIO_TEMPLATES.map((template) => ({
      template,
      name: TEMPLATE_META[template].name,
      description: TEMPLATE_META[template].description,
      dark: TEMPLATE_META[template].dark,
      previewImageUrl: null,
      accents: PORTFOLIO_ACCENTS.map((accent) => ({ accent, name: ACCENT_TOKENS[accent].label, color: ACCENT_TOKENS[accent].onLight })),
    }));
  }

  /** Tạo hồ sơ (slug tự sinh từ tên). Đua tạo cùng người dùng → trả bản đã có; đua slug → sinh lại (tối đa 3 lần). */
  private async createWith(
    userId: string,
    fields: Pick<UpdatePortfolioDto, "displayName" | "headline" | "bio" | "avatarAssetId" | "links" | "theme" | "seoIndexable">,
    sections: UpdatePortfolioDto["sections"] = DEFAULT_SECTIONS.map((s) => ({ ...s }))
  ): Promise<Portfolio> {
    if (fields.avatarAssetId) await this.d.assets.assertUsableImage(userId, fields.avatarAssetId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = await this.d.slugs.generate(fields.displayName);
      try {
        return await this.d.tx.run(async (tx) => {
          const created = await this.d.portfolios.create({ userId, slug, ...fields, sections }, tx);
          if (fields.avatarAssetId) await this.d.assets.replace(tx, { userId, assetId: fields.avatarAssetId, targetId: created.id });
          return created;
        });
      } catch (err) {
        if (!(err instanceof UniqueViolationError)) throw err;
        if (err.key.endsWith("userId")) {
          const raced = await this.d.portfolios.findByUserId(userId);
          if (raced) return raced;
        }
      }
    }
    throw new AppError("Không tạo được hồ sơ, vui lòng thử lại", 503, ErrorCode.SYS_503);
  }
}
