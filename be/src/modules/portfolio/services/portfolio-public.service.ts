import { SLUG_REGEX } from "../entities/portfolio.rules";
import type { Portfolio } from "../entities/portfolio.interface";
import type { IPortfolioSlugReservationRepository } from "../repositories/portfolio-slug-reservation.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import { buildFolder, type IPortfolioCache, type IPortfolioConfig, type IPortfolioStorage } from "./portfolio.ports";

export type PublicResolution =
  | { kind: "PAGE"; portfolioId: string; buildVersion: number; seoIndexable: boolean }
  | { kind: "REDIRECT"; to: string }
  | { kind: "NOT_FOUND" };

const NOT_FOUND: PublicResolution = { kind: "NOT_FOUND" };

/** Tên tệp ảnh được phục vụ (`GET /p/:slug/assets/:file`) — chỉ ảnh do build sinh, không đường dẫn tuỳ ý. */
export const PUBLIC_ASSET_REGEX = /^img-[a-z0-9]{8}\.webp$/;

/**
 * Tra cứu công khai `slug → trang` (be.md §5 "Public"): Redis `portfolio:slug:<slugKey>` (60 s, xoá NGAY khi Unpublish/gỡ/đổi slug/build mới) → DB. Hồ sơ đang PUBLISHED và chưa bị gỡ →
 * `PAGE`; slug cũ còn giữ 30 ngày mà hồ sơ mới đang công khai → `REDIRECT` (301); còn lại → `NOT_FOUND` (KHÔNG phân biệt "không tồn tại", "đã gỡ", "chưa công khai" — không lộ gì).
 * Chỉ cache kết quả DƯƠNG: 404 không được nhớ nên trang vừa công khai hiện ngay.
 */
export class PortfolioPublicService {
  constructor(
    private readonly portfolios: IPortfolioRepository,
    private readonly reservations: IPortfolioSlugReservationRepository,
    private readonly storage: IPortfolioStorage,
    private readonly cache: IPortfolioCache,
    private readonly config: IPortfolioConfig,
    private readonly storagePrefix: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async resolve(rawSlug: string): Promise<PublicResolution> {
    const slugKey = rawSlug.toLowerCase();
    if (!SLUG_REGEX.test(slugKey) || !(await this.config.active())) return NOT_FOUND;
    const cached = await this.cache.get(slugKey);
    if (cached) return cached;
    const found = await this.lookup(slugKey);
    if (found.kind !== "NOT_FOUND") await this.cache.set(slugKey, found);
    return found;
  }

  /** `index.html` của build đang phục vụ; `null` khi object không còn (đã dọn/mất) → route trả 404. */
  page(res: Extract<PublicResolution, { kind: "PAGE" }>): Promise<Buffer | null> {
    return this.storage.read(`${buildFolder(this.storagePrefix, res.portfolioId, res.buildVersion)}index.html`);
  }

  /** Ảnh của build đang phục vụ. Slug cũ (đã đổi) vẫn lấy được ảnh (HTML build cũ còn trỏ slug cũ tới khi build mới xong). */
  async asset(rawSlug: string, file: string): Promise<Buffer | null> {
    if (!PUBLIC_ASSET_REGEX.test(file)) return null;
    let res = await this.resolve(rawSlug);
    if (res.kind === "REDIRECT") res = await this.resolve(res.to);
    return res.kind === "PAGE" ? this.storage.read(`${buildFolder(this.storagePrefix, res.portfolioId, res.buildVersion)}${file}`) : null;
  }

  private async lookup(slugKey: string): Promise<PublicResolution> {
    const owner = await this.portfolios.findBySlugKey(slugKey);
    if (owner) return this.pageOf(owner);
    const held = await this.reservations.findByKey(slugKey);
    if (!held || held.redirectTo === null || held.expiresAt <= this.now()) return NOT_FOUND;
    const target = await this.portfolios.findBySlugKey(held.redirectTo);
    // Chỉ chuyển hướng tới hồ sơ ĐANG công khai — không để slug cũ tiết lộ slug mới của hồ sơ đã ngừng công khai.
    return target && this.pageOf(target).kind === "PAGE" ? { kind: "REDIRECT", to: held.redirectTo } : NOT_FOUND;
  }

  private pageOf(p: Portfolio): PublicResolution {
    if (p.status !== "PUBLISHED" || p.takenDownAt || p.currentBuildVersion === null) return NOT_FOUND;
    return { kind: "PAGE", portfolioId: p.id, buildVersion: p.currentBuildVersion, seoIndexable: p.seoIndexable };
  }
}
