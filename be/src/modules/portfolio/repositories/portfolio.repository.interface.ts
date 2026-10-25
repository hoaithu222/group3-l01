import type { Portfolio, PortfolioLink, PortfolioSection, PortfolioTheme } from "../entities/portfolio.interface";
import type { TxHandle } from "./tx";

export interface NewPortfolio {
  userId: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  links: PortfolioLink[];
  theme: PortfolioTheme;
  sections: PortfolioSection[];
  seoIndexable: boolean;
}

/** Trường hồ sơ sửa được qua `PUT /me/portfolio` (mọi trường tuỳ chọn ở tầng kho; DTO bắt buộc đủ). */
export interface ProfilePatch {
  displayName?: string;
  headline?: string | null;
  bio?: string | null;
  avatarAssetId?: string | null;
  links?: PortfolioLink[];
  theme?: PortfolioTheme;
  sections?: PortfolioSection[];
  seoIndexable?: boolean;
}

/** Kết quả `markPublished` — `applied=false` khi bị gỡ / đã có build mới hơn / đua ghi. */
export interface PublishMarkResult {
  applied: boolean;
  reason?: "TAKEN_DOWN" | "NEWER_BUILD" | "RACE" | "NOT_FOUND";
  wasPublished: boolean;
  previousBuildVersion: number | null;
}

/**
 * Kho `Portfolio`. Ghi có điều kiện (CAS `version`, trạng thái) trả `null`/`applied=false` khi thua đua — service tự đọc lại để phân biệt lỗi.
 * `create` PHẢI ghi `null` TƯỜNG MINH cho mọi trường lọc bằng `null` (Prisma-Mongo không khớp field vắng mặt).
 */
export interface IPortfolioRepository {
  findById(id: string, tx?: TxHandle): Promise<Portfolio | null>;
  findByUserId(userId: string, tx?: TxHandle): Promise<Portfolio | null>;
  findBySlugKey(slugKey: string, tx?: TxHandle): Promise<Portfolio | null>;
  /** Ném `UniqueViolationError` khi trùng `userId`/`slugKey`. */
  create(input: NewPortfolio, tx?: TxHandle): Promise<Portfolio>;
  /** CAS `version` (tăng 1). `null` khi lệch phiên bản/không tồn tại. */
  updateProfile(id: string, expectedVersion: number, patch: ProfilePatch, tx?: TxHandle): Promise<Portfolio | null>;
  /** CAS `version` (tăng 1); ném `UniqueViolationError` khi `slugKey` đã có người dùng. */
  changeSlug(id: string, expectedVersion: number, slug: string, tx?: TxHandle): Promise<Portfolio | null>;
  /**
   * `$inc nextBuildVersion` nguyên tử, trả số build vừa cấp. `expectedVersion` (Publish) = CAS phiên bản hồ sơ; vắng (build lại do hệ thống) = không kiểm.
   * `null` khi hồ sơ bị gỡ / lệch phiên bản / không tồn tại.
   */
  reserveBuildVersion(id: string, opts: { expectedVersion?: number }, tx?: TxHandle): Promise<number | null>;
  /** Đặt PUBLISHED + `currentBuildVersion` — chỉ khi chưa bị gỡ và `buildVersion` mới hơn build hiện tại (build cũ về muộn không ghi đè). */
  markPublished(id: string, buildVersion: number, at: Date, tx?: TxHandle): Promise<PublishMarkResult>;
  /** PUBLISHED → UNPUBLISHED. `null` khi không ở PUBLISHED (idempotent). */
  markUnpublished(id: string, at: Date, tx?: TxHandle): Promise<Portfolio | null>;
  /** Gỡ vi phạm: `takenDownAt/By/Reason` + về UNPUBLISHED. `null` khi đã bị gỡ (idempotent) hoặc không tồn tại. */
  setTakedown(id: string, by: string, reason: string, at: Date, tx?: TxHandle): Promise<Portfolio | null>;
  /** Mở lại (KHÔNG tự công khai). `null` khi không ở trạng thái bị gỡ. */
  clearTakedown(id: string, tx?: TxHandle): Promise<Portfolio | null>;
  /** Đánh dấu có thay đổi (dự án thêm/sửa/xoá/sắp xếp) — không tăng `version`. */
  touch(id: string, at: Date, tx?: TxHandle): Promise<void>;
  delete(id: string, tx?: TxHandle): Promise<boolean>;
}
