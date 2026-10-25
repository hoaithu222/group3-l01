import { randomBytes } from "crypto";
import { LIMITS } from "../../../core/constants/limits";
import { isReservedSlug } from "../../../core/constants/reserved-slugs";
import { normalizeSearch } from "../../../core/utils/normalize";
import { SLUG_REGEX } from "../entities/portfolio.rules";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { IPortfolioSlugReservationRepository } from "../repositories/portfolio-slug-reservation.repository.interface";
import { portfolioErrors } from "./portfolio.errors";
import type { IPortfolioConfig } from "./portfolio.ports";

export { SLUG_REGEX };

export type SlugUnavailableReason = "TAKEN" | "INVALID" | "BANNED" | "RESERVED";

export type SlugCheck = { ok: true; slugKey: string } | { ok: false; reason: SlugUnavailableReason };

/** `Đường-dẫn của TÔI` → `duong-dan-cua-toi` (chỉ để SINH gợi ý; đầu vào người dùng nhập luôn đi qua `check`). */
export function slugify(name: string, maxLength = 24): string {
  const base = normalizeSearch(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return base.length >= LIMITS.portfolio.slugMin ? base : "portfolio";
}

/**
 * Kiểm/đặt slug: regex → từ dành riêng (tĩnh) → từ cấm (`SystemConfig portfolio.bannedSlugTerms`, so khớp CHỨA chuỗi sau `normalizeSearch`) → trùng với hồ sơ khác hoặc
 * slug cũ còn giữ 30 ngày của hồ sơ khác. Slug đang là của CHÍNH hồ sơ (hoặc reservation của chính nó) luôn dùng lại được.
 */
export class PortfolioSlugService {
  constructor(
    private readonly portfolios: IPortfolioRepository,
    private readonly reservations: IPortfolioSlugReservationRepository,
    private readonly config: IPortfolioConfig,
    private readonly now: () => Date = () => new Date()
  ) {}

  normalize(raw: string): string {
    return raw.trim().toLowerCase();
  }

  async check(raw: string, portfolioId: string | null): Promise<SlugCheck> {
    const slugKey = this.normalize(raw);
    if (!SLUG_REGEX.test(slugKey)) return { ok: false, reason: "INVALID" };
    if (isReservedSlug(slugKey)) return { ok: false, reason: "RESERVED" };
    if (await this.containsBannedTerm(slugKey)) return { ok: false, reason: "BANNED" };
    const owner = await this.portfolios.findBySlugKey(slugKey);
    if (owner && owner.id !== portfolioId) return { ok: false, reason: "TAKEN" };
    const held = await this.reservations.findByKey(slugKey);
    if (held && held.expiresAt > this.now() && held.portfolioId !== portfolioId) return { ok: false, reason: "TAKEN" };
    return { ok: true, slugKey };
  }

  /** Ném `PORT_002` (sai dạng) / `PORT_003` (từ dành riêng hoặc từ cấm) / `PORT_001` (đã có người dùng); trả slug chuẩn hoá. */
  async assertUsable(raw: string, portfolioId: string | null): Promise<string> {
    const result = await this.check(raw, portfolioId);
    if (result.ok) return result.slugKey;
    if (result.reason === "INVALID") throw portfolioErrors.slugInvalid();
    if (result.reason === "TAKEN") throw portfolioErrors.slugTaken();
    throw portfolioErrors.slugForbidden();
  }

  /** Slug tự sinh lần đầu: tên + 4 ký tự ngẫu nhiên, thử tới khi dùng được (chỉ gọi khi tạo hồ sơ). */
  async generate(displayName: string): Promise<string> {
    const base = slugify(displayName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`;
      if ((await this.check(candidate, null)).ok) return candidate;
    }
    // Hiếm: tám lần trùng liên tiếp — kéo dài hậu tố (vẫn ≤ slugMax vì base ≤ 24).
    return `${base}-${randomBytes(3).toString("hex")}`.slice(0, LIMITS.portfolio.slugMax).replace(/-+$/g, "");
  }

  private async containsBannedTerm(slugKey: string): Promise<boolean> {
    const terms = await this.config.bannedSlugTerms();
    if (terms.length === 0) return false;
    const spaced = normalizeSearch(slugKey.replace(/-/g, " "));
    const compact = spaced.replace(/\s+/g, "");
    return terms.some((term) => {
      const t = normalizeSearch(term);
      return t.length > 0 && (spaced.includes(t) || compact.includes(t.replace(/\s+/g, "")));
    });
  }
}
