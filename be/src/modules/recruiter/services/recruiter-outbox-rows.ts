import type { OutboxEventInput } from "../../../infrastructure/queue";
import { DOMAIN_EVENTS, eventKeys, type CompanyStatusChangedPayload, type JobOfferEventPayload } from "../../../shared/events/domain-events";
import type { Company, JobOffer } from "../entities/recruiter.interface";

/** Tên queue/job của recruiter — MỘT nơi để producer (service) và consumer (`jobs/recruiter.jobs.ts`) không lệch. */
export const RECRUITER_NOTIFY_QUEUE = "notifications" as const;
export const RECRUITER_REPORTS_QUEUE = "reports" as const;
export const OFFER_EVENTS_JOB = "job-offer.events" as const;
export const COMPANY_STATUS_JOB = "company.status-notify" as const;
export const OFFER_EXPIRE_JOB = "job-offer.expire" as const;
export const TALENT_REBUILD_JOB = "talent.index-rebuild" as const;
export const USER_ANONYMIZED_JOB = "recruiter.on-user-anonymized" as const;
export const TALENT_RECONCILE_JOB = "talent.reconcile" as const;
export const OFFER_EXPIRE_SWEEP_JOB = "job-offer.expire-sweep" as const;

/** Lời mời đổi trạng thái (gửi/đọc/quan tâm/từ chối/thu hồi/hết hạn) → socket `offer:updated` tới sinh viên + mọi HR ACTIVE. `dedupeKey` gắn `version` nên mỗi lần chuyển một dòng. */
export function offerEventRow(event: "sent" | "responded", offer: JobOffer, at: Date): OutboxEventInput {
  const payload: JobOfferEventPayload = {
    event: event === "sent" ? DOMAIN_EVENTS.JOB_OFFER_SENT : DOMAIN_EVENTS.JOB_OFFER_RESPONDED,
    offerId: offer.id,
    companyId: offer.companyId,
    studentId: offer.studentId,
    status: offer.status,
    threadLocked: offer.threadLocked,
    version: offer.version,
    at: at.toISOString(),
  };
  return {
    type: payload.event,
    aggregateType: "JobOffer",
    aggregateId: offer.id,
    queue: RECRUITER_NOTIFY_QUEUE,
    jobName: OFFER_EVENTS_JOB,
    dedupeKey: event === "sent" ? eventKeys.jobOfferSent(offer.id) : eventKeys.jobOfferResponded(offer.id, offer.version),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** Hẹn giờ hết hạn tại `expiresAt` (bền qua restart — `availableAt`); processor CAS SENT|READ → EXPIRED nên chạy muộn/lặp vô hại. */
export function offerExpireRow(offer: Pick<JobOffer, "id" | "expiresAt">): OutboxEventInput {
  return {
    type: "job-offer.expire",
    aggregateType: "JobOffer",
    aggregateId: offer.id,
    queue: RECRUITER_REPORTS_QUEUE,
    jobName: OFFER_EXPIRE_JOB,
    dedupeKey: eventKeys.jobOfferExpire(offer.id),
    availableAt: offer.expiresAt,
    payload: { offerId: offer.id },
  };
}

export function companyStatusRow(company: Pick<Company, "id" | "status" | "tier" | "version">, notify: { owner?: boolean; ops?: boolean }, at: Date): OutboxEventInput {
  const payload: CompanyStatusChangedPayload = {
    event: DOMAIN_EVENTS.COMPANY_STATUS_CHANGED,
    companyId: company.id,
    status: company.status,
    tier: company.tier,
    version: company.version,
    notifyOwner: notify.owner === true,
    notifyOps: notify.ops === true,
    at: at.toISOString(),
  };
  return {
    type: payload.event,
    aggregateType: "Company",
    aggregateId: company.id,
    queue: RECRUITER_NOTIFY_QUEUE,
    jobName: COMPANY_STATUS_JOB,
    dedupeKey: eventKeys.companyStatusChanged(company.id, company.version),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** Dựng lại index của một người (debounce `delaySeconds`). `dedupeKey` gắn mili-giây (outbox unique) — processor bỏ qua khi index đã mới hơn `at`. */
export function talentRebuildRow(userId: string, at: Date, delaySeconds: number): OutboxEventInput {
  return {
    type: DOMAIN_EVENTS.CAREER_UPDATED,
    aggregateType: "UserCareer",
    aggregateId: userId,
    queue: RECRUITER_REPORTS_QUEUE,
    jobName: TALENT_REBUILD_JOB,
    dedupeKey: eventKeys.talentIndexRebuild(userId, `t${at.getTime()}`),
    availableAt: new Date(at.getTime() + delaySeconds * 1000),
    payload: { userId, at: at.toISOString() },
  };
}
