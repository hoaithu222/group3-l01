import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { Portfolio, PortfolioBuild, PortfolioProject } from "../entities/portfolio.interface";
import { PORTFOLIO_NOTIFICATION_TYPES } from "../notifications/portfolio.notification-types";
import type { IPortfolioBuildRepository } from "../repositories/portfolio-build.repository.interface";
import type { IPortfolioProjectRepository } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { IPortfolioNotifier, IPortfolioOutbox, ITxRunner } from "../repositories/tx";
import type { PortfolioPageComposer } from "./portfolio-page.composer";
import { publishedRow, purgeRow } from "./portfolio-outbox-rows";
import { PortfolioHtmlTooLargeError } from "./portfolio-renderer.service";
import type { PortfolioSnapshotService } from "./portfolio-snapshot.service";
import { buildFolder, type IPortfolioCache, type IPortfolioEmitter, type IPortfolioStorage } from "./portfolio.ports";

export interface BuildDeps {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  builds: IPortfolioBuildRepository;
  snapshots: PortfolioSnapshotService;
  composer: PortfolioPageComposer;
  storage: IPortfolioStorage;
  tx: ITxRunner;
  outbox: IPortfolioOutbox;
  notifier: IPortfolioNotifier;
  emitter: IPortfolioEmitter;
  cache: IPortfolioCache;
  storagePrefix: string;
  baseUrl: () => string;
  now: () => Date;
  timeoutMs?: number;
}

export interface BuildContext {
  /** Lần thử lại của BullMQ (`attemptsMade > 0`): chiếm lại build đang `BUILDING` dù chưa quá hạn (lượt trước đã chết/ném lỗi). */
  retry: boolean;
  /** Lượt thử CUỐI — lỗi tạm thời lúc này mới chuyển build sang FAILED + báo người dùng (các lượt trước để BullMQ thử lại). */
  finalAttempt: boolean;
}

export type BuildOutcome = "READY" | "SKIPPED" | "FAILED";

/** Lỗi KHÔNG thử lại được (thử lại không đổi kết quả) — build FAILED ngay. */
class PermanentBuildError extends Error {}

const SNAPSHOT_CONCURRENCY = 3;

const deadline = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_r, reject) => setTimeout(() => reject(new Error(`Quá thời gian tạo trang (${ms}ms)`)), ms).unref())]);

/** Câu tiếng Việt rút gọn cho `PortfolioBuild.error` (KHÔNG stack, không chi tiết hạ tầng). */
function userMessage(err: unknown): string {
  if (err instanceof PortfolioHtmlTooLargeError) return "Trang portfolio vượt dung lượng cho phép, hãy rút gọn nội dung";
  if (err instanceof PermanentBuildError) return err.message;
  if (err instanceof Error && err.message.startsWith("Quá thời gian")) return "Quá thời gian tạo trang, vui lòng thử lại";
  return "Không tạo được trang, vui lòng thử lại";
}

/**
 * `PortfolioBuildService` — xử lý job `portfolio.build` (be.md §5), idempotent theo `(portfolioId, buildVersion)`:
 * CAS `QUEUED → BUILDING` (job trùng/build đã READY → thoát, không dựng lại) → chụp lại snapshot dự án hiển thị → dựng HTML + ảnh → ghi storage → transaction: build READY + portfolio
 * PUBLISHED (`currentBuildVersion` chỉ tăng) + outbox `portfolio.published` + xếp dọn build cũ → sau commit xoá cache slug + socket. Lỗi: giữ nguyên bản đang phục vụ; FAILED + thông báo ở lượt cuối.
 */
export class PortfolioBuildService {
  constructor(private readonly d: BuildDeps) {}

  async run(input: { portfolioId: string; buildVersion: number }, ctx: BuildContext): Promise<BuildOutcome> {
    const d = this.d;
    const now = d.now();
    const build = await d.builds.find(input.portfolioId, input.buildVersion);
    if (!build || build.status === "READY" || build.status === "FAILED") return "SKIPPED";
    const timeoutMs = d.timeoutMs ?? LIMITS.portfolio.buildTimeoutSec * 1000;
    const claimed = await d.builds.claim(build.id, { now, staleBefore: ctx.retry ? new Date(now.getTime() + 1) : new Date(now.getTime() - timeoutMs * 2) });
    if (!claimed) return "SKIPPED"; // job khác đang dựng (lease còn mới)

    const written: string[] = [];
    let ownerId: string | null = null;
    try {
      const portfolio = await d.portfolios.findById(input.portfolioId);
      if (!portfolio) throw new PermanentBuildError("Hồ sơ không còn tồn tại");
      ownerId = portfolio.userId;
      if (portfolio.takenDownAt) throw new PermanentBuildError("Hồ sơ đã bị gỡ");
      d.emitter.buildUpdated(ownerId, { v: 1, portfolioId: portfolio.id, buildId: build.id, buildVersion: build.buildVersion, status: "BUILDING" });
      return await deadline(this.build(portfolio, claimed, written), timeoutMs);
    } catch (err) {
      const permanent = err instanceof PermanentBuildError || err instanceof PortfolioHtmlTooLargeError;
      logger.error("[portfolio.build] lỗi", { ...input, permanent, finalAttempt: ctx.finalAttempt, error: err instanceof Error ? err.message : String(err) });
      if (!permanent && !ctx.finalAttempt) throw err; // BullMQ thử lại (backoff)
      await this.fail(claimed, ownerId, written, userMessage(err));
      if (permanent) return "FAILED";
      throw err;
    }
  }

  /** Cron `portfolio.stale-build-reaper`: build treo quá hạn → FAILED + báo người dùng. Trả số build đã đóng. */
  async reapStale(limit = 100): Promise<number> {
    const now = this.d.now();
    const minutes = LIMITS.portfolio.staleBuildMinutes;
    const stale = await this.d.builds.findStale({ buildingBefore: new Date(now.getTime() - minutes * 60_000), queuedBefore: new Date(now.getTime() - minutes * 6 * 60_000) }, limit);
    let closed = 0;
    for (const build of stale) {
      const portfolio = await this.d.portfolios.findById(build.portfolioId);
      if (await this.fail(build, portfolio?.userId ?? null, [], "Quá thời gian tạo trang, vui lòng thử lại")) closed += 1;
    }
    return closed;
  }

  private async build(portfolio: Portfolio, build: PortfolioBuild, written: string[]): Promise<BuildOutcome> {
    const d = this.d;
    const now = d.now();
    const projects = await this.refreshSnapshots(portfolio, await d.projects.listByPortfolio(portfolio.id), now);
    const page = await d.composer.compose(portfolio, projects, { mode: "public", generatedAt: now });

    const folder = buildFolder(d.storagePrefix, portfolio.id, build.buildVersion);
    const html = Buffer.from(page.html, "utf8");
    await d.storage.put(`${folder}index.html`, html, "text/html; charset=utf-8");
    written.push(`${folder}index.html`);
    let size = html.length;
    for (const [name, buffer] of page.files) {
      await d.storage.put(`${folder}${name}`, buffer, "image/webp");
      written.push(`${folder}${name}`);
      size += buffer.length;
    }

    const url = `${d.baseUrl()}/${portfolio.slug}`;
    const outcome = await d.tx.run(async (tx) => {
      const ready = await d.builds.markReady(build.id, { storageKey: folder, files: ["index.html", ...page.files.keys()], sizeBytes: size }, now, tx);
      if (!ready) return "CLOSED" as const; // build đã bị đóng (Ngừng công khai/gỡ vi phạm) — không "sống lại" trang
      const mark = await d.portfolios.markPublished(portfolio.id, build.buildVersion, now, tx);
      const delay = LIMITS.portfolio.purgeDelayMinutes * 60_000;
      if (mark.applied) {
        await d.outbox.add(tx, publishedRow({ portfolioId: portfolio.id, userId: portfolio.userId, slug: portfolio.slug, url, buildVersion: build.buildVersion }, now));
        if (mark.previousBuildVersion !== null) await d.outbox.add(tx, purgeRow(portfolio.id, mark.previousBuildVersion, delay, now));
        return "READY" as const;
      }
      // Bị gỡ / đã có build mới hơn / đua ghi: build này không phục vụ → xếp dọn object của chính nó.
      await d.outbox.add(tx, purgeRow(portfolio.id, build.buildVersion, delay, now));
      return "SUPERSEDED" as const;
    });

    if (outcome === "CLOSED") {
      await d.storage.deleteMany(written).catch(() => undefined);
      return "SKIPPED";
    }
    await d.cache.del([portfolio.slugKey]);
    d.emitter.buildUpdated(portfolio.userId, { v: 1, portfolioId: portfolio.id, buildId: build.id, buildVersion: build.buildVersion, status: "READY", ...(outcome === "READY" && { url }) });
    return outcome === "READY" ? "READY" : "SKIPPED";
  }

  /** Chụp lại số liệu các dự án HIỂN THỊ (số liệu trang luôn khớp dữ liệu tại thời điểm công bố). Lỗi một dự án → giữ snapshot cũ của nó. */
  private async refreshSnapshots(portfolio: Portfolio, all: PortfolioProject[], now: Date): Promise<PortfolioProject[]> {
    const visible = all.filter((p) => p.visible);
    const fresh = new Map<string, PortfolioProject>();
    for (let i = 0; i < visible.length; i += SNAPSHOT_CONCURRENCY) {
      await Promise.all(
        visible.slice(i, i + SNAPSHOT_CONCURRENCY).map(async (project) => {
          try {
            const snapshot = await this.d.snapshots.capture(portfolio.userId, project.workspaceId, { showTeammates: project.showTeammates, previous: project.snapshot });
            const updated = snapshot ? await this.d.projects.updateSnapshot(project.id, snapshot, now) : null;
            if (updated) fresh.set(project.id, updated);
          } catch (err) {
            logger.warn("[portfolio.build] giữ snapshot cũ của dự án", { projectId: project.id, error: err instanceof Error ? err.message : String(err) });
          }
        })
      );
    }
    return all.map((p) => fresh.get(p.id) ?? p);
  }

  /** Đóng build FAILED (CAS) + thông báo người dùng + socket + dọn object đã ghi dở. `false` khi build đã đóng trước đó. */
  private async fail(build: PortfolioBuild, ownerId: string | null, written: string[], message: string): Promise<boolean> {
    const d = this.d;
    const now = d.now();
    const closed = await d.tx.run(async (tx) => {
      if (!(await d.builds.markFailed(build.id, message, now, tx))) return false;
      if (ownerId) {
        const key = `portfolio-build-failed:${build.id}`;
        await d.notifier.notify(tx, {
          type: PORTFOLIO_NOTIFICATION_TYPES.BUILD_FAILED,
          scope: null,
          source: { type: "PortfolioBuild", id: key },
          refs: { portfolioId: build.portfolioId, buildId: build.id },
          recipients: [{ userId: ownerId }],
          dedupeKey: key,
        });
      }
      return true;
    });
    if (written.length > 0) await d.storage.deleteMany(written).catch(() => undefined);
    if (closed && ownerId) d.emitter.buildUpdated(ownerId, { v: 1, portfolioId: build.portfolioId, buildId: build.id, buildVersion: build.buildVersion, status: "FAILED", error: message });
    return closed;
  }
}
