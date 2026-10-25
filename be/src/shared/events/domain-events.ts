/**
 * Hợp đồng sự kiện MIỀN của Phase 4 (README Phase 4 §4) — tên, schema Zod của payload và hàm dựng `dedupeKey` outbox, dùng
 * CHUNG cho producer (`study`, sau này p5-01) và consumer (`gamification`) để hai phía không lệch nhau.
 *
 * Quy ước outbox (đã đối chiếu mã `infrastructure/queue/outbox/*`):
 *  - `dedupeKey` là unique index của `OutboxEvent` VÀ là `jobId` BullMQ (relay tự đổi `:` → `_` — `toSafeJobId`), nên số dấu `:` tuỳ ý.
 *  - Mỗi cặp (queue, jobName) chỉ có MỘT processor (`registerJob` là `Map.set` — đăng ký lần hai GHI ĐÈ âm thầm). Một sự kiện nhiều
 *    consumer ⇒ hoặc sink registry sau MỘT processor (mẫu `task.events` của `projects`), hoặc producer ghi MỘT dòng outbox RIÊNG
 *    cho mỗi consumer trong cùng transaction (dedupeKey khác nhau, vd hậu tố `:<consumer>`).
 *  - Consumer idempotent theo THỰC THỂ NGUỒN (`XpEvent.dedupeKey`), không dựa vào `jobId`.
 * `schemaVersion: 1` do `outbox.add` tự thêm vào payload — không khai ở đây.
 */
import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const iso = z.string().datetime({ offset: true });

export const DOMAIN_EVENTS = {
  QUIZ_SCORED: "quiz.scored",
  SR_REVIEWED: "sr.reviewed",
  SR_ITEM_DELETED: "sr.item-deleted",
  STUDY_SET_PUBLISHED: "study-set.published",
  XP_AWARDED: "xp.awarded",
  GAMIFICATION_LEVEL_UP: "gamification.level-up",
  /** p4-05 — một người nộp chấm (producer: `projects/services/review/review-submit.service.ts`; consumer XP: gamification). */
  REVIEW_SUBMITTED: "review.submitted",
  /** p4-05 — mở lượt chấm / giao lại người chấm (job `notifications/review.events`: thông báo + hẹn nhắc + realtime). */
  REVIEW_ASSIGNED: "review.assigned",
  /** p4-05 — lượt chấm đóng (`APPROVED` / `CHANGES_REQUESTED` / `WAIVED`) — báo người làm thẻ. */
  REVIEW_ROUND_CLOSED: "review.round-closed",
  /** p4-05 — người chấm không còn phải chấm (rời REVIEW, tắt chấm chéo, thẻ bị xoá, bị giao lại thủ công). */
  REVIEW_CANCELLED: "review.cancelled",
  /** p4-05 — nhóm không đủ người chấm (số lượt thực < cấu hình) — báo OWNER/ADMIN. */
  REVIEW_SHORTAGE: "review.shortage",
  /** p6-06 — huy hiệu kỹ năng vừa được cấp / bị thu hồi / được khôi phục (job `gamification/skill.events`; p6-07 snapshot, p6-08 index đăng ký sink). */
  SKILL_UNLOCKED: "skill.unlocked",
  SKILL_REVOKED: "skill.revoked",
  SKILL_RESTORED: "skill.restored",
  /** p6-07 — trang portfolio vừa được công khai / ngừng công khai (job `reports/portfolio.events` → sink của p6-08 index nhà tuyển dụng). `portfolio.build` = lệnh dựng trang. */
  PORTFOLIO_PUBLISHED: "portfolio.published",
  PORTFOLIO_UNPUBLISHED: "portfolio.unpublished",
  PORTFOLIO_BUILD: "portfolio.build",
  /** p6-08 — hồ sơ nghề nghiệp đổi (Open to work/tiêu đề/vị trí/khu vực/chặn doanh nghiệp) → dựng lại `TalentSearchIndex` (job `reports/talent.index-rebuild`). */
  CAREER_UPDATED: "career.updated",
  /** p6-08 — lời mời vừa gửi / được trả lời (Quan tâm, Từ chối) / thu hồi / hết hạn → socket `offer:updated` + thông báo (job `notifications/offer.events`). */
  JOB_OFFER_SENT: "job-offer.sent",
  JOB_OFFER_RESPONDED: "job-offer.responded",
  /** p6-08 — công ty được duyệt/từ chối/tạm ngưng/khôi phục hoặc đổi gói → socket `company:updated` + thông báo cho chủ (job `notifications/company.status-notify`). */
  COMPANY_STATUS_CHANGED: "company.status-changed",
  /** p4-07 — buổi học lộ trình CHUYỂN sang COMPLETED lần đầu (producer: `roadmap/services/lesson.service.ts#putProgress`; consumer XP: gamification, RM-14). */
  ROADMAP_LESSON_COMPLETED: "roadmap.lesson-completed",
} as const;

/** Thi thử xong (`kind MOCK`, p4-02) hoặc live quiz xong (`kind LIVE`, p5-01). `attemptId` = id THỰC THỂ NGUỒN (lượt thi / phiên live). */
export const quizScoredSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.QUIZ_SCORED),
  attemptId: z.string().min(1),
  userId: objectId,
  setId: objectId,
  scorePct: z.number().min(0).max(100),
  kind: z.enum(["MOCK", "LIVE"]),
  passed: z.boolean(),
  submittedAt: iso,
});
export type QuizScoredPayload = z.infer<typeof quizScoredSchema>;

/** Một lượt ôn thẻ (gộp theo ngày — mỗi thẻ mỗi ngày một sự kiện). `grade` = q SM-2 (1|3|4|5). */
export const srReviewedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.SR_REVIEWED),
  userId: objectId,
  itemId: objectId,
  setId: objectId,
  grade: z.number().int().min(1).max(5),
  reviewedAt: iso,
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SrReviewedPayload = z.infer<typeof srReviewedSchema>;

/** Bộ học được công khai lần đầu với đủ số mục (p4-01) — chủ bộ nhận XP `STUDY_SET_PUBLISHED`. */
export const studySetPublishedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.STUDY_SET_PUBLISHED),
  setId: objectId,
  ownerId: objectId,
  itemCount: z.number().int().min(0),
  publishedAt: iso,
});
export type StudySetPublishedPayload = z.infer<typeof studySetPublishedSchema>;

/**
 * p4-05 — chấm chéo. `reviewerId` nhận XP. Producer luôn điền đủ mọi trường; các trường "optional" giữ tương thích với consumer p4-03
 * (chỉ cần reviewId/taskId/reviewerId). `assigneeIds` = người làm thẻ TẠI LÚC nộp (p4-06 chia điểm review cho họ).
 * KHÔNG có nhận xét/điểm theo tiêu chí — chỉ `score10` (thang chung của p4-06/p6-06).
 */
export const reviewSubmittedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.REVIEW_SUBMITTED),
  reviewId: z.string().min(1),
  taskId: objectId,
  boardId: objectId.optional(),
  workspaceId: objectId.optional(),
  roundId: objectId.optional(),
  reviewerId: objectId,
  assigneeIds: z.array(objectId).optional(),
  status: z.string().optional(),
  score10: z.number().min(0).max(10).optional(),
  submittedAt: iso.optional(),
});
export type ReviewSubmittedPayload = z.infer<typeof reviewSubmittedSchema>;

const reviewRef = z.object({ reviewId: objectId, reviewerId: objectId });

/** p4-05 — mở lượt / giao lại: `reviews` = các lượt chấm MỚI được giao (giao lại: đúng một). */
export const reviewAssignedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.REVIEW_ASSIGNED),
  roundId: objectId,
  taskId: objectId,
  boardId: objectId,
  workspaceId: objectId,
  round: z.number().int().min(1),
  reviews: z.array(reviewRef),
  cause: z.enum(["ROUND_OPENED", "REASSIGNED"]),
});
export type ReviewAssignedPayload = z.infer<typeof reviewAssignedSchema>;

/** p4-05 — lượt chấm đóng. `actorId` = người miễn chấm/nộp chấm cuối; `null` = hệ thống (tự duyệt do thiếu người). */
export const reviewRoundClosedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.REVIEW_ROUND_CLOSED),
  roundId: objectId,
  taskId: objectId,
  boardId: objectId,
  workspaceId: objectId,
  round: z.number().int().min(1),
  status: z.enum(["APPROVED", "CHANGES_REQUESTED", "WAIVED"]),
  autoApproved: z.boolean(),
  assigneeIds: z.array(objectId),
  actorId: objectId.nullable(),
});
export type ReviewRoundClosedPayload = z.infer<typeof reviewRoundClosedSchema>;

export const REVIEW_CANCEL_REASONS = ["LEFT_REVIEW", "REVIEW_DISABLED", "TASK_DELETED", "MANUAL"] as const;

/** p4-05 — người chấm không còn phải chấm (`reviews` = các lượt chấm vừa bị huỷ). */
export const reviewCancelledSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.REVIEW_CANCELLED),
  roundId: objectId,
  taskId: objectId,
  boardId: objectId,
  workspaceId: objectId,
  round: z.number().int().min(1),
  reviews: z.array(reviewRef),
  reason: z.enum(REVIEW_CANCEL_REASONS),
});
export type ReviewCancelledPayload = z.infer<typeof reviewCancelledSchema>;

/** p4-05 — số lượt duyệt thực < cấu hình vì nhóm không đủ người chấm (`requiredReviews = 0` ⇒ `autoApproved`). */
export const reviewShortageSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.REVIEW_SHORTAGE),
  roundId: objectId,
  taskId: objectId,
  boardId: objectId,
  workspaceId: objectId,
  round: z.number().int().min(1),
  requiredReviews: z.number().int().min(0),
  configuredReviews: z.number().int().min(1),
  autoApproved: z.boolean(),
});
export type ReviewShortagePayload = z.infer<typeof reviewShortageSchema>;

/** XP thật sự được cộng (> 0) — p7-02 (coins) tái dùng chống farm của XP. */
export const xpAwardedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.XP_AWARDED),
  userId: objectId,
  sourceType: z.string(),
  sourceId: z.string(),
  workspaceId: objectId.nullable(),
  xp: z.number().int().min(1),
  at: iso,
});
export type XpAwardedPayload = z.infer<typeof xpAwardedSchema>;

export const levelUpSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.GAMIFICATION_LEVEL_UP),
  userId: objectId,
  from: z.number().int().min(1),
  to: z.number().int().min(2),
});
export type LevelUpPayload = z.infer<typeof levelUpSchema>;

/** Mục bị xoá khỏi bộ — dọn `SrProgress` của mọi người ôn mục đó. */
export const srItemDeletedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.SR_ITEM_DELETED),
  setId: objectId,
  itemIds: z.array(objectId).min(1),
  setVersion: z.number().int().min(1),
});
export type SrItemDeletedPayload = z.infer<typeof srItemDeletedSchema>;

/**
 * p6-06 (việc #1) — hợp đồng `task.completed` / `task.reopened` (producer p3-02 `projects/events/task-event.factory.ts`, kiểu TS ở
 * `projects/events/project-events.ts`) ở PHẦN mà consumer kỹ năng dùng. `.passthrough()` — producer thêm trường không làm vỡ consumer.
 * `review.roundId` do `ReviewDonePolicy` (p4-05) gộp vào khi bảng bật chấm chéo; `labelNames` = tên nhãn GỐC lúc hoàn thành.
 */
export const taskCompletedSchema = z
  .object({
    event: z.literal("task.completed"),
    taskId: objectId,
    boardId: objectId,
    workspaceId: objectId,
    assigneeIds: z.array(objectId),
    storyPoints: z.number().nullable(),
    completedAt: iso,
    completionCount: z.number().int().min(1),
    labelNames: z.array(z.string()),
    review: z.object({ enabled: z.boolean(), approved: z.boolean(), roundId: objectId.optional() }).passthrough(),
  })
  .passthrough();
export type TaskCompletedContract = z.infer<typeof taskCompletedSchema>;

export const taskReopenedSchema = z
  .object({
    event: z.literal("task.reopened"),
    taskId: objectId,
    workspaceId: objectId,
    assigneeIds: z.array(objectId),
    completionCount: z.number().int().min(0),
    reopenedAt: iso,
  })
  .passthrough();
export type TaskReopenedContract = z.infer<typeof taskReopenedSchema>;

/** p6-06 — sự kiện RA của huy hiệu kỹ năng (`skill.unlocked|revoked|restored`). Chỉ id + mã/tên kỹ năng (danh mục công khai), KHÔNG minh chứng. */
export const skillBadgeEventSchema = z.object({
  event: z.enum([DOMAIN_EVENTS.SKILL_UNLOCKED, DOMAIN_EVENTS.SKILL_REVOKED, DOMAIN_EVENTS.SKILL_RESTORED]),
  userId: objectId,
  skillId: objectId,
  code: z.string(),
  name: z.string(),
  icon: z.string(),
  at: iso,
});
export type SkillBadgeEventPayload = z.infer<typeof skillBadgeEventSchema>;

/** p6-07 — lệnh dựng trang (job `reports/portfolio.build`); idempotent theo `(portfolioId, buildVersion)`. */
export const portfolioBuildSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.PORTFOLIO_BUILD),
  portfolioId: objectId,
  buildVersion: z.number().int().min(1),
});
export type PortfolioBuildPayload = z.infer<typeof portfolioBuildSchema>;

/** p6-07 — trang đã công khai (build READY). `url` = `<PUBLIC_PORTFOLIO_BASE_URL>/<slug>`. p6-08 lập chỉ mục `portfolioUrl` cho thẻ ứng viên từ sự kiện này. */
export const portfolioPublishedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.PORTFOLIO_PUBLISHED),
  portfolioId: objectId,
  userId: objectId,
  slug: z.string(),
  url: z.string(),
  buildVersion: z.number().int().min(1),
  at: iso,
});
export type PortfolioPublishedPayload = z.infer<typeof portfolioPublishedSchema>;

/** p6-07 — trang không còn công khai: người dùng ngừng, vận hành gỡ vi phạm, hoặc tài khoản bị ẩn danh hoá. */
export const PORTFOLIO_UNPUBLISH_REASONS = ["UNPUBLISH", "TAKEDOWN", "ANONYMIZED"] as const;
export const portfolioUnpublishedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.PORTFOLIO_UNPUBLISHED),
  portfolioId: objectId,
  userId: objectId,
  reason: z.enum(PORTFOLIO_UNPUBLISH_REASONS),
  at: iso,
});
export type PortfolioUnpublishedPayload = z.infer<typeof portfolioUnpublishedSchema>;

/** p6-08 — hồ sơ nghề nghiệp đổi. `openToWork` = giá trị SAU khi đổi; chỉ id + cờ, KHÔNG tiêu đề/vị trí/khu vực. */
export const careerUpdatedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.CAREER_UPDATED),
  userId: objectId,
  openToWork: z.boolean(),
  at: iso,
});
export type CareerUpdatedPayload = z.infer<typeof careerUpdatedSchema>;

export const JOB_OFFER_STATUSES = ["SENT", "READ", "INTERESTED", "DECLINED", "WITHDRAWN", "EXPIRED"] as const;

/** p6-08 — lời mời đổi trạng thái (`job-offer.sent` | `job-offer.responded`). KHÔNG tiêu đề/nội dung lời mời — chỉ id + trạng thái + `version` (thứ tự cho client). */
export const jobOfferEventSchema = z.object({
  event: z.enum([DOMAIN_EVENTS.JOB_OFFER_SENT, DOMAIN_EVENTS.JOB_OFFER_RESPONDED]),
  offerId: objectId,
  companyId: objectId,
  studentId: objectId,
  status: z.enum(JOB_OFFER_STATUSES),
  threadLocked: z.boolean(),
  version: z.number().int().min(1),
  at: iso,
});
export type JobOfferEventPayload = z.infer<typeof jobOfferEventSchema>;

/** p6-08 — công ty đổi trạng thái/gói. `notifyOwner=false` cho đổi gói/hạn mức thuần (chỉ socket, không thông báo đẩy); `notifyOps` = báo vận hành có công ty cần xử lý (đăng ký mới, gửi duyệt lại, chủ sở hữu cuối cùng xoá tài khoản). */
export const companyStatusChangedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.COMPANY_STATUS_CHANGED),
  companyId: objectId,
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
  tier: z.enum(["FREE", "PRO", "ENTERPRISE"]),
  version: z.number().int().min(1),
  notifyOwner: z.boolean(),
  notifyOps: z.boolean().default(false),
  at: iso,
});
export type CompanyStatusChangedPayload = z.infer<typeof companyStatusChangedSchema>;

/**
 * p4-07 (be.md §5.4, mirror `studySetPublishedSchema`) — buổi học lộ trình hoàn thành LẦN ĐẦU. Không thuộc workspace nào
 * (`XpInput.workspaceId` luôn `null` ở mapper). `lessonId` là THỰC THỂ NGUỒN của `XpEvent` (cùng `userId` ⇒ idempotent).
 */
export const roadmapLessonCompletedSchema = z.object({
  event: z.literal(DOMAIN_EVENTS.ROADMAP_LESSON_COMPLETED),
  userId: objectId,
  lessonId: objectId,
  subjectId: objectId,
  completedAt: iso,
});
export type RoadmapLessonCompletedPayload = z.infer<typeof roadmapLessonCompletedSchema>;

/** `dedupeKey` outbox — MỘT nơi dựng để producer/consumer không lệch (jobId = dedupeKey, `:` → `_` ở relay). */
export const eventKeys = {
  /** MOCK: `quiz.scored:attempt:<attemptId>`; LIVE (p5-01): `quiz.scored:live:<sessionId>:<userId>` (thay `quiz-score:{sessionId}:{userId}` cũ). */
  quizScored: (kind: "MOCK" | "LIVE", sourceId: string, userId?: string): string =>
    kind === "MOCK" ? `quiz.scored:attempt:${sourceId}` : `quiz.scored:live:${sourceId}:${userId ?? ""}`,
  srReviewed: (userId: string, localDate: string, itemId: string): string => `sr.reviewed:user:${userId}:${localDate}:${itemId}`,
  srItemDeleted: (setId: string, setVersion: number): string => `sr.item-deleted:set:${setId}:v${setVersion}`,
  studySetPublished: (setId: string): string => `study-set.published:set:${setId}`,
  reviewSubmitted: (reviewId: string): string => `review.submitted:review:${reviewId}`,
  /** Dòng outbox RIÊNG cho consumer p4-06 (`reports/contribution.review-fact`) — cùng sự kiện `review.submitted` nhưng `dedupeKey` outbox là unique. */
  contributionReviewFact: (reviewId: string): string => `contribution.review-fact:review:${reviewId}`,
  /** Lượt mở đầu: `review.assigned:round:<id>`; người thay thế khi giao lại: thêm hậu tố `:r<reviewId>` (dedupeKey outbox là unique). */
  reviewAssigned: (roundId: string, reviewId?: string): string =>
    reviewId ? `review.assigned:round:${roundId}:r${reviewId}` : `review.assigned:round:${roundId}`,
  reviewRoundClosed: (roundId: string): string => `review.round-closed:round:${roundId}`,
  /** Huỷ cả lượt: `…:round:<id>`; huỷ MỘT lượt chấm (giao lại thủ công): `…:review:<id>`. */
  reviewCancelled: (scope: { roundId: string } | { reviewId: string }): string =>
    "roundId" in scope ? `review.cancelled:round:${scope.roundId}` : `review.cancelled:review:${scope.reviewId}`,
  reviewShortage: (roundId: string, roundVersion: number): string => `review.shortage:round:${roundId}:v${roundVersion}`,
  reviewReminder: (reviewId: string, hours: number): string => `review.reminder:review:${reviewId}:h${hours}`,
  reviewBackfill: (boardId: string, boardVersion: number): string => `review.backfill:board:${boardId}:v${boardVersion}`,
  xpAwarded: (xpDedupeKey: string): string => `xp.awarded:${xpDedupeKey}`,
  levelUp: (userId: string, to: number): string => `gamification.level-up:user:${userId}:l${to}`,
  mockExpire: (attemptId: string): string => `mock-attempt.expire:attempt:${attemptId}`,
  /** p6-06 — huy hiệu cấp đúng MỘT lần/(người, kỹ năng) nên khoá không cần hậu tố; thu hồi/khôi phục lặp được ⇒ hậu tố thời điểm (ms). */
  skillUnlocked: (userId: string, skillId: string): string => `skill.unlocked:user:${userId}:skill:${skillId}`,
  skillRevoked: (userId: string, skillId: string, atMs: number): string => `skill.revoked:user:${userId}:skill:${skillId}:t${atMs}`,
  skillRestored: (userId: string, skillId: string, atMs: number): string => `skill.restored:user:${userId}:skill:${skillId}:t${atMs}`,
  /** Đánh giá lại MỘT kỹ năng sau khi bật/đổi tiêu chí (`version` sau khi ghi) — cùng phiên bản chạy một lần. */
  skillReevaluate: (skillId: string, version: number): string => `skill.reevaluate:skill:${skillId}:v${version}`,
  /** "Đánh giá lại toàn bộ" (limiter 1 lần/giờ) — `bucket` = số giờ kể từ epoch. */
  skillReevaluateAll: (bucket: number): string => `skill.reevaluate-all:h${bucket}`,
  /** p6-07 — mỗi (portfolio, buildVersion) một lệnh dựng; jobId = dedupeKey (relay đổi `:` → `_`). */
  portfolioBuild: (portfolioId: string, buildVersion: number): string => `portfolio.build:portfolio:${portfolioId}:b${buildVersion}`,
  /** Một build có thể bị xếp dọn nhiều lần (Ngừng công khai → công khai lại → build mới thay) — hậu tố thời điểm (ms) tránh trùng `dedupeKey` (P2002 huỷ transaction); processor idempotent theo `purgedAt`. */
  portfolioPurgeBuild: (portfolioId: string, buildVersion: number, atMs: number): string => `portfolio.purge-build:portfolio:${portfolioId}:b${buildVersion}:t${atMs}`,
  portfolioPublished: (portfolioId: string, buildVersion: number): string => `portfolio.published:portfolio:${portfolioId}:b${buildVersion}`,
  /** Ngừng công khai lặp được (công khai → ngừng → công khai…) ⇒ hậu tố thời điểm (ms). */
  portfolioUnpublished: (portfolioId: string, atMs: number): string => `portfolio.unpublished:portfolio:${portfolioId}:t${atMs}`,
  /** p6-08 — dựng lại index: gộp theo phút (`minuteBucket` = `yyyyMMddHHmm` theo UTC) nên nhiều thay đổi liên tiếp chỉ xếp MỘT job. */
  talentIndexRebuild: (userId: string, minuteBucket: string): string => `talent.index-rebuild:user:${userId}:${minuteBucket}`,
  /** p6-08 — lời mời gửi đúng một lần; đổi trạng thái theo `version` (CAS) nên mỗi phiên bản một dòng. */
  jobOfferSent: (offerId: string): string => `job-offer.sent:offer:${offerId}`,
  jobOfferResponded: (offerId: string, version: number): string => `job-offer.responded:offer:${offerId}:v${version}`,
  /** Hẹn giờ hết hạn: một lần/lời mời (`availableAt = expiresAt`). */
  jobOfferExpire: (offerId: string): string => `job-offer.expire:offer:${offerId}`,
  companyStatusChanged: (companyId: string, version: number): string => `company.status-changed:company:${companyId}:v${version}`,
  /** p4-07 — outbox `gamification/xp.consume` VÀ khoá dedupe nhắc học dùng chung format này (be.md §5.4). */
  roadmapLessonCompleted: (userId: string, lessonId: string): string => `roadmap.lesson-completed:user:${userId}:lesson:${lessonId}`,
} as const;
