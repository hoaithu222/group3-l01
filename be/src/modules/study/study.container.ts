import { registerAssetTargetReadResolver } from "../../shared/ports/asset-target-access.port";
import { registerReportTargetExtension, type ReportPort } from "../../shared/ports/report.port";
import { AuditService } from "../audit-log/audit-log.service";
import { createReportPort } from "../moderation/public";
import { PrismaMockAnswerRepository } from "./repositories/mock-answer.repository.prisma";
import { PrismaMockAttemptRepository } from "./repositories/mock-attempt.repository.prisma";
import { PrismaStudyNotifier, PrismaStudyOutbox, RedisEventDedupe } from "./repositories/ports";
import { PrismaSrEnrollmentRepository } from "./repositories/sr-enrollment.repository.prisma";
import { PrismaSrProgressRepository } from "./repositories/sr-progress.repository.prisma";
import { PrismaSrReviewLogRepository } from "./repositories/sr-review-log.repository.prisma";
import { PrismaStudyItemRepository } from "./repositories/study-item.repository.prisma";
import { PrismaStudySetRepository } from "./repositories/study-set.repository.prisma";
import { PrismaTxRunner } from "./repositories/tx";
import { PrismaStudyUserDirectory } from "./repositories/user-directory";
import { StudyAssetReadResolver } from "./services/study-asset-read.resolver";
import { PublicStudyAssetPort } from "./services/study-asset.port.public";
import { StudyContentReader } from "./services/study-content.reader";
import { MockAttemptService } from "./services/mock-attempt.service";
import { SrReminderService } from "./services/sr-reminder.service";
import { SrReviewService } from "./services/sr-review.service";
import { SrService } from "./services/sr.service";
import { StudyItemBulkService } from "./services/study-item-bulk.service";
import { StudyUserDataEraser } from "./services/study-user-data.eraser";
import { StudyAdminOverviewService } from "./services/study-admin-overview.service";
import { StudyItemQueryService } from "./services/study-item-query.service";
import { StudySetDuplicateService } from "./services/study-set-duplicate.service";
import { StudySetListService } from "./services/study-set-list.service";
import { StudySetModerationService } from "./services/study-set-moderation.service";
import { StudySetReportService, StudySetReportTarget, STUDY_SET_REPORT_TARGET } from "./services/study-report.service";
import { PermissionStudyWorkspaceRoles, StudySetAccess } from "./services/study-set-access";
import { StudySetService } from "./services/study-set.service";
import { RedisStudyTagCache } from "./services/study-tag-cache";

export interface StudyContainer {
  access: StudySetAccess;
  sets: StudySetService;
  lists: StudySetListService;
  duplicates: StudySetDuplicateService;
  itemQuery: StudyItemQueryService;
  itemBulk: StudyItemBulkService;
  reports: StudySetReportService;
  moderation: StudySetModerationService;
  /** Số liệu chỉ đọc cho admin: bộ PUBLIC bị báo cáo nhiều + bộ đếm học tập của người dùng. */
  adminOverview: StudyAdminOverviewService;
  assetReadResolver: StudyAssetReadResolver;
  reportTarget: StudySetReportTarget;
  /** Cổng đọc nội dung cho module khác (`@modules/study/public`). */
  content: StudyContentReader;
  /** p4-02 — thi thử có giờ. */
  mock: MockAttemptService;
  /** p4-02 — ôn tập ngắt quãng SM-2: đăng ký/hàng đợi/tóm tắt, lượt ôn, nhắc hằng ngày. */
  sr: SrService;
  srReview: SrReviewService;
  srReminder: SrReminderService;
  /** Ẩn danh hoá tài khoản: xoá dữ liệu thi thử/ôn tập của người dùng. */
  userData: StudyUserDataEraser;
}

let instance: StudyContainer | null = null;

/**
 * Nối DI cho module `study` (Prisma + Redis thật) — MỘT lần cho API (`study.routes.ts`, `study.admin.routes.ts`) lẫn worker
 * (`jobs/study-report.consumer.ts`), vì tiến trình worker không import `router.ts`. p4-02 (mock/SR) dùng lại `access`/repository của
 * cùng container (`mock`, `sr`, `srReview`, `srReminder`, `userData`).
 */
export function getStudyContainer(overrides: { reports?: ReportPort } = {}): StudyContainer {
  if (instance) return instance;

  const sets = new PrismaStudySetRepository();
  const items = new PrismaStudyItemRepository();
  const roles = new PermissionStudyWorkspaceRoles();
  const access = new StudySetAccess(roles);
  const tx = new PrismaTxRunner();
  const users = new PrismaStudyUserDirectory();
  const outbox = new PrismaStudyOutbox();
  const notifier = new PrismaStudyNotifier();
  const enrollments = new PrismaSrEnrollmentRepository();
  const deps = { sets, items, tx, assets: new PublicStudyAssetPort(), access, roles, users, outbox, enrollments };
  const reportPort = overrides.reports ?? createReportPort();

  // p4-02 — thi thử + ôn tập ngắt quãng dùng lại `sets`/`items`/`access`/`tx` của p4-01.
  const attempts = new PrismaMockAttemptRepository();
  const answers = new PrismaMockAnswerRepository();
  const progress = new PrismaSrProgressRepository();
  const logs = new PrismaSrReviewLogRepository();
  const srDeps = { sets, items, access, progress, enrollments, logs, tx, users, outbox, notifier };
  const sr = new SrService(srDeps);

  instance = {
    access,
    sets: new StudySetService(deps),
    lists: new StudySetListService(deps, new RedisStudyTagCache()),
    duplicates: new StudySetDuplicateService(deps),
    itemQuery: new StudyItemQueryService(deps),
    itemBulk: new StudyItemBulkService(deps),
    reports: new StudySetReportService(deps, reportPort),
    moderation: new StudySetModerationService(deps, new AuditService(), reportPort),
    adminOverview: new StudyAdminOverviewService(deps),
    assetReadResolver: new StudyAssetReadResolver(sets, items, access),
    reportTarget: new StudySetReportTarget(deps),
    content: new StudyContentReader(deps),
    mock: new MockAttemptService({ sets, items, attempts, answers, progress, tx, access, users, outbox, notifier, events: new RedisEventDedupe() }),
    sr,
    srReview: new SrReviewService(srDeps),
    srReminder: new SrReminderService(srDeps, sr),
    userData: new StudyUserDataEraser({ attempts, answers, progress, enrollments, logs }),
  };
  return instance;
}

/**
 * Điểm cắm vào module khác — CHẠY ở mọi tiến trình cần (API: `study.routes.ts`; worker: `jobs/study-report.consumer.ts`):
 * quyền đọc asset `STUDY_ITEM`/`STUDY_SET_COVER` (module `assets`) và đích báo cáo `STUDY_SET` (module `moderation`). Đăng ký
 * lại vô hại (ghi đè bằng cùng cài đặt).
 */
export function registerStudyIntegrations(): void {
  const c = getStudyContainer();
  registerAssetTargetReadResolver("STUDY_ITEM", c.assetReadResolver);
  registerAssetTargetReadResolver("STUDY_SET_COVER", c.assetReadResolver);
  registerReportTargetExtension(STUDY_SET_REPORT_TARGET, c.reportTarget);
}
