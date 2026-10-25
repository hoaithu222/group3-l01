import { defineCron, enqueue, registerJob, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { DOMAIN_EVENTS, portfolioBuildSchema, portfolioPublishedSchema, portfolioUnpublishedSchema, skillBadgeEventSchema } from "../../../shared/events/domain-events";
import { registerReportTargetExtension } from "../../../shared/ports/report.port";
import { registerSkillEventSink } from "../../career/public";
import { registerPortfolioNotificationTypes } from "../notifications/portfolio.notification-types";
import { getPortfolioContainer } from "../portfolio.container";
import { dispatchPortfolioEvent } from "../services/portfolio-event-sinks";
import { PORTFOLIO_BUILD_JOB, PORTFOLIO_EVENTS_JOB, PORTFOLIO_PURGE_JOB, PORTFOLIO_QUEUE } from "../services/portfolio-outbox-rows";
import { PORTFOLIO_REPORT_TARGET, PortfolioReportTarget } from "../services/portfolio-report-target";

const SKILL_REVOKED_JOB = "portfolio.on-skill-revoked";
const USER_ANONYMIZED_JOB = "portfolio.on-user-anonymized";
const RESERVATION_CLEANUP_JOB = "portfolio.slug-reservation-cleanup";
const STALE_REAPER_JOB = "portfolio.stale-build-reaper";

/**
 * Job của portfolio (p6-07 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`). Cũng đăng ký loại thông báo và đích báo cáo `PORTFOLIO` ở đây:
 * `moderation/report.events` chạy ở worker và tra registry để gọi `onReportCreated`; thiếu ở worker ⇒ test parity `worker-registries.parity.test.ts` đỏ.
 */
registerPortfolioNotificationTypes();
registerReportTargetExtension(PORTFOLIO_REPORT_TARGET, new PortfolioReportTarget(getPortfolioContainer().portfolios));

/** Dựng trang (outbox `portfolio.build`): idempotent theo `(portfolioId, buildVersion)`. BullMQ thử lại 3 lần; lượt cuối mới FAILED + báo người dùng. */
registerJob(PORTFOLIO_QUEUE, PORTFOLIO_BUILD_JOB, async (job) => {
  const parsed = portfolioBuildSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[portfolio.build] payload sai hợp đồng — bỏ qua", { id: job.id });
    return;
  }
  const attempts = job.opts.attempts ?? 1;
  const outcome = await getPortfolioContainer().build.run(parsed.data, { retry: job.attemptsMade > 0, finalAttempt: job.attemptsMade + 1 >= attempts });
  logger.info("[portfolio.build] xong", { id: job.id, ...parsed.data, outcome });
});

/** Dọn object của build không còn phục vụ (outbox `portfolio.purge-build`, trễ 10 phút). */
registerJob(PORTFOLIO_QUEUE, PORTFOLIO_PURGE_JOB, async (job) => {
  const { portfolioId, buildVersion } = job.data as { portfolioId?: string; buildVersion?: number };
  if (!portfolioId || typeof buildVersion !== "number") return;
  await getPortfolioContainer().events.purgeBuild(portfolioId, buildVersion);
});

/** Sự kiện RA `portfolio.published|unpublished` → sink của p6-08 (`registerPortfolioEventSink`). */
registerJob(PORTFOLIO_QUEUE, PORTFOLIO_EVENTS_JOB, async (job) => {
  const published = portfolioPublishedSchema.safeParse(job.data);
  if (published.success) return dispatchPortfolioEvent(published.data);
  const unpublished = portfolioUnpublishedSchema.safeParse(job.data);
  if (unpublished.success) return dispatchPortfolioEvent(unpublished.data);
  logger.warn("[portfolio.events] payload sai hợp đồng — bỏ qua", { id: job.id });
});

/**
 * `skill.revoked` (p6-06): sink của `gamification/skill.events` chỉ XẾP job riêng `gamification/portfolio.on-skill-revoked` (retry riêng — lỗi ở đây không kéo sink của p6-08 chạy lại);
 * jobId theo (người, kỹ năng, thời điểm thu hồi).
 */
registerSkillEventSink("p6-07.portfolio", async (payload) => {
  if (payload.event !== DOMAIN_EVENTS.SKILL_REVOKED) return;
  await enqueue("gamification", SKILL_REVOKED_JOB, payload, { jobId: toSafeJobId(`portfolio.skill-revoked:${payload.userId}:${payload.skillId}:${payload.at}`) });
});

registerJob("gamification", SKILL_REVOKED_JOB, async (job) => {
  const parsed = skillBadgeEventSchema.safeParse(job.data);
  if (!parsed.success) return;
  const outcome = await getPortfolioContainer().events.onSkillRevoked(parsed.data.userId);
  logger.info("[portfolio.on-skill-revoked] xong", { userId: parsed.data.userId, skillId: parsed.data.skillId, outcome });
});

/** Ẩn danh hoá tài khoản (`UserAnonymizer` ghi dòng outbox RIÊNG `portfolio.on-user-anonymized:user:<id>`): gỡ trang, object build, dự án; giữ slug 30 ngày. */
registerJob("notifications", USER_ANONYMIZED_JOB, async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) return;
  const outcome = await getPortfolioContainer().events.onUserAnonymized(userId);
  logger.info("[portfolio.on-user-anonymized] xong", { userId, outcome });
});

/** Cron TĨNH 03:10 — giải phóng slug hết hạn giữ chỗ (không tạo scheduler theo thực thể: `syncCronSchedulers` xoá scheduler ngoài registry). */
registerJob("cron", RESERVATION_CLEANUP_JOB, async () => {
  const removed = await getPortfolioContainer().events.cleanupReservations();
  logger.info("[portfolio.slug-reservation-cleanup] xong", { removed });
});
defineCron({ schedulerId: RESERVATION_CLEANUP_JOB, queue: "cron", jobName: RESERVATION_CLEANUP_JOB, pattern: "10 3 * * *", opts: { attempts: 1 } });

/** Cron TĨNH mỗi 10 phút — build BUILDING/QUEUED quá hạn → FAILED + báo người dùng (worker chết giữa chừng). */
registerJob("cron", STALE_REAPER_JOB, async () => {
  const closed = await getPortfolioContainer().build.reapStale();
  if (closed > 0) logger.warn("[portfolio.stale-build-reaper] đã đóng build treo", { closed });
});
defineCron({ schedulerId: STALE_REAPER_JOB, queue: "cron", jobName: STALE_REAPER_JOB, pattern: "*/10 * * * *", opts: { attempts: 1 } });
