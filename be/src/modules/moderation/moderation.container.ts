import { permissionService } from "../../core/permission";
import { AuditService } from "../audit-log/audit-log.service";
import { createMessageModerationPort } from "../messages/public";
import { createChannelAdminPort } from "../channels";
import { createConversationAdminPort } from "../conversations/public";
import { createUsersAdminPort } from "../users/public";
import { registerModerationNotificationTypes } from "./moderation.notification-types";
import { PrismaReportRepository } from "./repositories/report.repository.prisma";
import { PrismaModerationDirectory } from "./repositories/moderation-directory.repository.prisma";
import { ModerationReportPort } from "./services/report-port";
import { ReportTargetResolver } from "./services/report-target.resolver";
import { ReportService } from "./services/report.service";
import { ReportCloser } from "./services/report-closer";
import { ScopeModerationService } from "./services/scope-moderation.service";
import { PlatformModerationService } from "./services/platform-moderation.service";

/**
 * DI wiring dùng chung cho 3 file routes của module (be.md p1-08 §1: `reports.routes.ts`, `scope-reports.routes.ts`,
 * `admin-moderation.routes.ts`) — dựng repo → resolver → service MỘT lần/tiến trình. Đăng ký loại thông báo (side-effect)
 * để `notify()` ở consumer/worker hay API đều tra được.
 */
registerModerationNotificationTypes();

const repo = new PrismaReportRepository();
const directory = new PrismaModerationDirectory();
const messagePort = createMessageModerationPort();
const closer = new ReportCloser(repo, new AuditService());

export const reportService = new ReportService(repo, new ReportTargetResolver(messagePort, directory, permissionService));
/** Cổng cho module khác (p4-01 `study`) gửi/đóng báo cáo mà không import `moderation` — xem `public.ts`. */
export const reportPort = new ModerationReportPort(reportService, repo, closer);
export const scopeModerationService = new ScopeModerationService(repo, directory, messagePort, permissionService, closer);
export const platformModerationService = new PlatformModerationService(
  repo,
  directory,
  messagePort,
  closer,
  createUsersAdminPort(),
  createChannelAdminPort(),
  createConversationAdminPort()
);
