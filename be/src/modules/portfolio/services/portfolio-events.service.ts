import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { PortfolioBuild } from "../entities/portfolio.interface";
import type { IPortfolioBuildRepository } from "../repositories/portfolio-build.repository.interface";
import type { IPortfolioProjectRepository } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioSlugReservationRepository } from "../repositories/portfolio-slug-reservation.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { IPortfolioOutbox, ITxRunner } from "../repositories/tx";
import type { PortfolioBuildScheduler } from "./portfolio-build.scheduler";
import { unpublishedRow } from "./portfolio-outbox-rows";
import { buildFolder, type IPortfolioAssets, type IPortfolioCache, type IPortfolioStorage } from "./portfolio.ports";

export interface EventsServiceDeps {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  builds: IPortfolioBuildRepository;
  reservations: IPortfolioSlugReservationRepository;
  scheduler: PortfolioBuildScheduler;
  tx: ITxRunner;
  outbox: IPortfolioOutbox;
  assets: IPortfolioAssets;
  storage: IPortfolioStorage;
  cache: IPortfolioCache;
  storagePrefix: string;
  now: () => Date;
}

const DAY_MS = 86_400_000;

/** Thư mục object của một build (ưu tiên khoá đã ghi lúc READY, rơi về khoá suy ra từ phiên bản). */
const folderOf = (d: Pick<EventsServiceDeps, "storagePrefix">, b: PortfolioBuild): string => b.storageKey ?? buildFolder(d.storagePrefix, b.portfolioId, b.buildVersion);

/** Consumer sự kiện & job nền của portfolio: `skill.revoked`, `user.anonymized`, dọn build, dọn slug hết hạn. Mọi hàm idempotent (job retry vô hại). */
export class PortfolioEventsService {
  constructor(private readonly d: EventsServiceDeps) {}

  /** Huy hiệu bị thu hồi → trang đang công khai của người đó dựng lại NGAY (bỏ qua giới hạn Publish) để huy hiệu biến khỏi trang công khai (CR-32). */
  async onSkillRevoked(userId: string): Promise<"SCHEDULED" | "SKIPPED"> {
    const pf = await this.d.portfolios.findByUserId(userId);
    if (!pf || pf.status !== "PUBLISHED" || pf.takenDownAt) return "SKIPPED";
    const scheduled = await this.d.tx.run(async (tx) => {
      // Đã có bản CHỜ (chưa bắt đầu) → bản đó sẽ đọc huy hiệu mới nhất khi chạy; bản đang DỰNG có thể đã đọc trước thu hồi nên vẫn xếp thêm một bản.
      if (await this.d.builds.hasQueued(pf.id, tx)) return false;
      return (await this.d.scheduler.schedule(tx, { portfolioId: pf.id, portfolioVersion: pf.version, trigger: "SKILL_REVOKED", createdBy: null })) !== null;
    });
    return scheduled ? "SCHEDULED" : "SKIPPED";
  }

  /**
   * Tài khoản đã ẩn danh hoá → gỡ toàn bộ: object build (storage TRƯỚC, idempotent), dự án, link ảnh; slug giữ 30 ngày (`redirectTo = null`: 404 nhưng không ai khác lấy được),
   * rồi xoá hồ sơ + bản ghi build. Chạy lại khi đã xoá → `NONE`.
   */
  async onUserAnonymized(userId: string): Promise<"DELETED" | "NONE"> {
    const pf = await this.d.portfolios.findByUserId(userId);
    if (!pf) return "NONE";
    const builds = await this.d.builds.listByPortfolio(pf.id);
    const keys = builds.flatMap((b) => b.files.map((f) => `${folderOf(this.d, b)}${f}`));
    await this.d.storage.deleteMany(keys);
    const projectIds = (await this.d.projects.listByPortfolio(pf.id)).map((p) => p.id);
    const now = this.d.now();
    await this.d.tx.run(async (tx) => {
      await this.d.builds.failInFlight(pf.id, "Tài khoản đã bị xoá", now, tx);
      for (const id of [pf.id, ...projectIds]) await this.d.assets.detachAll(tx, id);
      await this.d.projects.deleteByPortfolio(pf.id, tx);
      await this.d.builds.deleteByPortfolio(pf.id, tx);
      await this.d.reservations.upsert({ slugKey: pf.slugKey, portfolioId: pf.id, redirectTo: null, expiresAt: new Date(now.getTime() + LIMITS.portfolio.slugReserveDays * DAY_MS) }, tx);
      await this.d.reservations.redirectAll(pf.id, null, tx);
      if (pf.status === "PUBLISHED") await this.d.outbox.add(tx, unpublishedRow({ portfolioId: pf.id, userId, reason: "ANONYMIZED" }, now));
      await this.d.portfolios.delete(pf.id, tx);
    });
    await this.d.cache.del([pf.slugKey]);
    return "DELETED";
  }

  /** Job `portfolio.purge-build`: xoá object của build KHÔNG còn được phục vụ (bỏ qua build đang là bản hiện hành của hồ sơ đang công khai). Lỗi storage → ném để BullMQ thử lại. */
  async purgeBuild(portfolioId: string, buildVersion: number): Promise<"PURGED" | "SKIPPED"> {
    const build = await this.d.builds.find(portfolioId, buildVersion);
    if (!build || build.purgedAt) return "SKIPPED";
    const pf = await this.d.portfolios.findById(portfolioId);
    if (pf && pf.status === "PUBLISHED" && pf.currentBuildVersion === buildVersion) return "SKIPPED";
    // Build còn đang dựng/chờ dựng: KHÔNG xoá dưới chân job (job tự dọn khi xong/thất bại).
    if (build.status === "QUEUED" || build.status === "BUILDING") return "SKIPPED";
    await this.d.storage.deleteMany(build.files.map((f) => `${folderOf(this.d, build)}${f}`));
    await this.d.builds.markPurged(build.id, this.d.now());
    logger.info("[portfolio.purge-build] đã dọn object build", { portfolioId, buildVersion, files: build.files.length });
    return "PURGED";
  }

  /** Cron `portfolio.slug-reservation-cleanup`: xoá reservation hết hạn (giải phóng slug) và cache của chúng. Trả số bản ghi đã xoá. */
  async cleanupReservations(): Promise<number> {
    const keys = await this.d.reservations.deleteExpired(this.d.now(), LIMITS.portfolio.reservationCleanupBatch);
    if (keys.length > 0) await this.d.cache.del(keys);
    return keys.length;
  }
}
