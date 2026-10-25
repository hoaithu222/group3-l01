import { Eta } from "eta";
import { LIMITS } from "../../../core/constants/limits";
import type { PortfolioLink, PortfolioProject, PortfolioSection, PortfolioTheme } from "../entities/portfolio.interface";
import { LAYOUT } from "../templates/layout";
import { PARTIALS } from "../templates/partials";
import { templateCss } from "../templates/styles";
import { TEMPLATE_META } from "../templates/theme-tokens";
import { buildProjectView, formatDateTimeVN, formatMonthYear, safeHttpsUrl, sectionsWithContent, toParagraphs } from "./portfolio-view";

export interface PageProject {
  project: PortfolioProject;
  /** URL ảnh bìa trong trang (`/p/<slug>/assets/img-xxxx.webp` hoặc data URI khi xem trước); `null` = không có ảnh. */
  coverUrl: string | null;
}

export interface PageInput {
  /** `preview`: luôn noindex + banner, ảnh nhúng data URI, không canonical. */
  mode: "public" | "preview";
  displayName: string;
  headline: string | null;
  bio: string | null;
  links: readonly PortfolioLink[];
  theme: PortfolioTheme;
  sections: readonly PortfolioSection[];
  seoIndexable: boolean;
  avatarUrl: string | null;
  projects: readonly PageProject[];
  badges: readonly { name: string; unlockedAt: Date }[];
  canonicalUrl: string | null;
  generatedAt: Date;
}

export class PortfolioHtmlTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`Trang HTML ${bytes} byte vượt trần cho phép`);
    this.name = "PortfolioHtmlTooLargeError";
  }
}

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/**
 * `PortfolioRenderer` — dựng trang HTML TĨNH bằng Eta (`autoEscape: true`: mọi giá trị động bị thoát `& < > " '`; template KHÔNG có JS). Bốn mẫu dùng chung một khung
 * (`templates/layout.ts`), khác CSS. Liên kết chỉ `https:` (loại `javascript:`/`data:`/`http:`), `rel="noopener nofollow ugc"`. Vượt `htmlMaxBytes` → `PortfolioHtmlTooLargeError`.
 */
export class PortfolioRenderer {
  private readonly eta: Eta;

  constructor(private readonly htmlMaxBytes: number = LIMITS.portfolio.htmlMaxBytes) {
    this.eta = new Eta({ autoEscape: true, autoTrim: false, useWith: false, cache: true });
    for (const [name, source] of Object.entries(PARTIALS)) this.eta.loadTemplate(name, source);
    this.eta.loadTemplate("@layout", LAYOUT);
  }

  render(input: PageInput): string {
    const isPreview = input.mode === "preview";
    const links = input.links.flatMap((l) => {
      const url = safeHttpsUrl(l.url);
      return url && l.label.trim() ? [{ label: l.label.trim(), url }] : [];
    });
    const aboutParagraphs = toParagraphs(input.bio);
    const generatedAtText = formatDateTimeVN(input.generatedAt);
    const projects = input.projects.map((p) => buildProjectView(p.project, { coverUrl: p.coverUrl, snapshotAtText: formatDateTimeVN(p.project.snapshotAt) }));
    const badges = input.badges.map((b) => ({ name: b.name, unlockedText: `Từ ${formatMonthYear(b.unlockedAt)}` }));
    const sections = sectionsWithContent(input.sections, { hasAbout: aboutParagraphs.length > 0, hasProjects: projects.length > 0, hasSkills: badges.length > 0, hasContact: links.length > 0 }).map((kind) => ({ kind }));

    const description = clip(input.headline ?? input.bio?.replace(/\s+/g, " ").trim() ?? `Hồ sơ portfolio của ${input.displayName}`, 160);
    const html = this.eta.render("@layout", {
      title: clip(input.headline ? `${input.displayName} — ${input.headline}` : `Portfolio của ${input.displayName}`, 70),
      description,
      colorScheme: TEMPLATE_META[input.theme.template].dark ? "dark" : "light",
      noindex: isPreview || !input.seoIndexable,
      canonicalUrl: isPreview ? null : input.canonicalUrl,
      previewBanner: isPreview,
      css: templateCss(input.theme.template, input.theme.accent),
      bodyClass: `tpl-${input.theme.template.toLowerCase()}`,
      displayName: input.displayName,
      headline: input.headline,
      avatarUrl: input.avatarUrl,
      aboutParagraphs,
      sections,
      projects,
      badges,
      links,
      generatedAtText,
    });
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes > this.htmlMaxBytes) throw new PortfolioHtmlTooLargeError(bytes);
    return html;
  }
}
