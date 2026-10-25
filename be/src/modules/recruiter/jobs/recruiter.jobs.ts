import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { DOMAIN_EVENTS, companyStatusChangedSchema, jobOfferEventSchema, type SkillBadgeEventPayload } from "../../../shared/events/domain-events";
import { registerSkillEventSink } from "../../career/public";
import { registerPortfolioEventSink, type PortfolioEventPayload } from "../../portfolio/public";
import { registerRecruiterNotificationTypes } from "../notifications/recruiter.notification-types";
import { getRecruiterContainer } from "../recruiter.container";
import {
  COMPANY_STATUS_JOB,
  OFFER_EVENTS_JOB,
  OFFER_EXPIRE_JOB,
  OFFER_EXPIRE_SWEEP_JOB,
  RECRUITER_NOTIFY_QUEUE,
  RECRUITER_REPORTS_QUEUE,
  TALENT_RECONCILE_JOB,
  TALENT_REBUILD_JOB,
  USER_ANONYMIZED_JOB,
} from "../services/recruiter-outbox-rows";
import { registerRecruiterIntegrations } from "../services/recruiter-integrations";

/**
 * Job của recruiter (p6-08 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`). Đăng ký lại loại thông báo, resolver scope `COMPANY`, provider quyền và đích
 * báo cáo `COMPANY`/`JOB_OFFER` ở đây: `report.events`/`deliver.recipient` chạy ở worker và tra các registry đó (thiếu ⇒ test parity `worker-registries.parity.test.ts` đỏ).
 */
registerRecruiterNotificationTypes();
registerRecruiterIntegrations(getRecruiterContainer().deps);

const svc = () => getRecruiterContainer().services;
const dep = () => getRecruiterContainer().deps;

/** `job-offer.sent|responded` → socket `offer:updated` (sinh viên + HR ACTIVE). Thông báo đẩy đã ghi cùng transaction lúc gửi/trả lời (`notify`). */
registerJob(RECRUITER_NOTIFY_QUEUE, OFFER_EVENTS_JOB, async (job) => {
  const parsed = jobOfferEventSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[job-offer.events] payload sai hợp đồng — bỏ qua", { id: job.id });
    return;
  }
  await svc().events.onOfferEvent(parsed.data);
});

/** `company.status-changed` → socket `company:updated`, thông báo OWNER/vận hành, phát lại `offer:updated` cho lời mời mở của công ty. */
registerJob(RECRUITER_NOTIFY_QUEUE, COMPANY_STATUS_JOB, async (job) => {
  const parsed = companyStatusChangedSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[company.status-notify] payload sai hợp đồng — bỏ qua", { id: job.id });
    return;
  }
  await svc().events.onCompanyStatus(parsed.data);
});

/**
 * Dựng lại `TalentSearchIndex` của một người (outbox `career.updated` hoặc sink kỹ năng/portfolio, có debounce). Idempotent: bỏ qua khi bản chiếu đã được dựng SAU thời điểm sự kiện (`at`);
 * người không đủ điều kiện (tắt Open to work/không ACTIVE) → xoá bản chiếu.
 */
registerJob(RECRUITER_REPORTS_QUEUE, TALENT_REBUILD_JOB, async (job) => {
  const { userId, at } = job.data as { userId?: string; at?: string };
  if (!userId) return;
  const existing = await dep().index.find(userId);
  if (existing && at && existing.rebuiltAt.getTime() >= new Date(at).getTime()) return;
  const outcome = await svc().talentIndex.rebuild(userId);
  logger.info("[talent.index-rebuild] xong", { userId, outcome });
});

/** Hết hạn một lời mời (hàng outbox hẹn giờ tại `expiresAt`): CAS SENT|READ → EXPIRED, không tốn thêm lượt. */
registerJob(RECRUITER_REPORTS_QUEUE, OFFER_EXPIRE_JOB, async (job) => {
  const { offerId } = job.data as { offerId?: string };
  if (!offerId) return;
  const expired = await svc().offers.expireOne(offerId);
  if (expired) logger.info("[job-offer.expire] đã hết hạn", { offerId });
});

/** Ẩn danh hoá tài khoản (`UserAnonymizer` ghi dòng outbox RIÊNG `recruiter.on-user-anonymized:user:<id>`): xoá index/chặn/lượt xem, khoá lời mời, gỡ nhân sự (OWNER cuối cùng → tạm ngưng công ty). */
registerJob(RECRUITER_NOTIFY_QUEUE, USER_ANONYMIZED_JOB, async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) return;
  const r = await svc().events.onUserAnonymized(userId);
  logger.info("[recruiter.on-user-anonymized] xong", { userId, ...r });
});

/** Cron TĨNH 01:00 — quét bù lời mời quá hạn (mất job hẹn giờ). Không tạo scheduler theo thực thể (`syncCronSchedulers` xoá scheduler ngoài registry). */
registerJob("cron", OFFER_EXPIRE_SWEEP_JOB, async () => {
  const n = await svc().offers.expireDue();
  if (n > 0) logger.info("[job-offer.expire-sweep] đã hết hạn", { count: n });
});
defineCron({ schedulerId: OFFER_EXPIRE_SWEEP_JOB, queue: "cron", jobName: OFFER_EXPIRE_SWEEP_JOB, pattern: "0 1 * * *", opts: { attempts: 1 } });

/** Cron TĨNH 02:45 — đối soát `TalentSearchIndex` với `UserCareer.openToWork` + dựng lại bản cũ hơn 7 ngày. */
registerJob("cron", TALENT_RECONCILE_JOB, async () => {
  const r = await svc().talentIndex.reconcile();
  logger.info("[talent.reconcile] xong", { ...r });
});
defineCron({ schedulerId: TALENT_RECONCILE_JOB, queue: "cron", jobName: TALENT_RECONCILE_JOB, pattern: "45 2 * * *", opts: { attempts: 1 } });

/** Sự kiện đầu vào: huy hiệu kỹ năng (`skill.unlocked|revoked|restored`) và portfolio (`published|unpublished`) đổi → xếp dựng lại index của người đó (debounce). */
registerSkillEventSink("p6-08.recruiter", async (payload: SkillBadgeEventPayload) => {
  await svc().talentIndex.schedule(payload.userId);
});
registerPortfolioEventSink("p6-08.recruiter", async (payload: PortfolioEventPayload) => {
  if (payload.event === DOMAIN_EVENTS.PORTFOLIO_PUBLISHED || payload.event === DOMAIN_EVENTS.PORTFOLIO_UNPUBLISHED) await svc().talentIndex.schedule(payload.userId);
});
