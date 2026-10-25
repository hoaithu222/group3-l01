import type { Portfolio, PortfolioProject, PortfolioTheme } from "../entities/portfolio.interface";
import type { IPortfolioSourceRepository } from "../repositories/portfolio-source.repository.interface";
import type { SkillBadgeReadPort } from "../../career/public";
import { toDataUri, type PortfolioImageService, type PreparedImage } from "./portfolio-image.service";
import type { PortfolioRenderer } from "./portfolio-renderer.service";
import { visibleSections } from "./portfolio-view";

/** Đường dẫn công khai mà BE phục vụ (mount ở `app.ts`, NGOÀI `/api`) — ảnh trong trang trỏ `/p/<slug>/assets/<file>`. */
export const PUBLIC_MOUNT = "/p";

export interface ComposedPage {
  html: string;
  /** Ảnh đã resize để ghi cạnh `index.html` (chỉ chế độ `public`; xem trước nhúng data URI nên rỗng). */
  files: Map<string, Buffer>;
}

export interface ComposeOptions {
  mode: "public" | "preview";
  generatedAt: Date;
  /** Chỉ xem trước: thử mẫu/màu khác mà chưa lưu. */
  themeOverride?: Partial<PortfolioTheme>;
}

/**
 * Dựng trang từ trạng thái HIỆN TẠI của hồ sơ (dùng chung cho build công khai và xem trước): huy hiệu còn hiệu lực (chỉ khi chủ bật `showSkills`), ảnh đại diện (ảnh riêng hoặc ảnh
 * tài khoản), ảnh bìa dự án → render. Số liệu dự án lấy từ snapshot đã lưu (build chụp lại TRƯỚC khi gọi hàm này).
 */
export class PortfolioPageComposer {
  constructor(
    private readonly source: IPortfolioSourceRepository,
    private readonly career: Pick<SkillBadgeReadPort, "activeBadges" | "career">,
    private readonly images: PortfolioImageService,
    private readonly renderer: PortfolioRenderer,
    private readonly baseUrl: () => string
  ) {}

  async compose(portfolio: Portfolio, projects: readonly PortfolioProject[], opts: ComposeOptions): Promise<ComposedPage> {
    const files = new Map<string, Buffer>();
    const inline = opts.mode === "preview";
    const urlOf = (img: PreparedImage | null): string | null => {
      if (!img) return null;
      if (inline) return toDataUri(img);
      files.set(img.name, img.buffer);
      return `${PUBLIC_MOUNT}/${portfolio.slug}/assets/${img.name}`;
    };

    const visible = projects.filter((p) => p.visible).sort((a, b) => a.order - b.order);
    const showSections = new Set(visibleSections(portfolio.sections).map((s) => s.kind));
    const [career, account] = await Promise.all([this.career.career(portfolio.userId), this.source.users([portfolio.userId])]);

    const badges = career.visibility.showSkills && showSections.has("SKILLS") ? (await this.career.activeBadges(portfolio.userId)).map((b) => ({ name: b.skill.name, unlockedAt: new Date(b.unlockedAt) })) : [];
    const avatarAssetId = portfolio.avatarAssetId ?? account.get(portfolio.userId)?.avatarAssetId ?? null;
    const avatarUrl = urlOf(avatarAssetId ? await this.images.avatar(avatarAssetId) : null);
    const pageProjects = showSections.has("PROJECTS")
      ? await Promise.all(visible.map(async (project) => ({ project, coverUrl: urlOf(project.coverAssetId ? await this.images.cover(project.coverAssetId, inline) : null) })))
      : [];

    const html = this.renderer.render({
      mode: opts.mode,
      displayName: portfolio.displayName,
      headline: portfolio.headline,
      bio: portfolio.bio,
      links: portfolio.links,
      theme: { ...portfolio.theme, ...opts.themeOverride },
      sections: portfolio.sections,
      seoIndexable: portfolio.seoIndexable,
      avatarUrl,
      projects: pageProjects,
      badges,
      canonicalUrl: `${this.baseUrl()}/${portfolio.slug}`,
      generatedAt: opts.generatedAt,
    });
    return { html, files };
  }
}
