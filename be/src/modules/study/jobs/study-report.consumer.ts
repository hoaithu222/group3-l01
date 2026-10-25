import { registerStudyIntegrations } from "../study.container";

/**
 * Worker: `report.events` (`moderation/jobs/report-events.consumer.ts`) tra registry `shared/ports/report.port` để gọi
 * `onReportCreated` (đặt `StudySet.reportedCount` theo số báo cáo mở — idempotent). Tiến trình worker không import
 * `study.routes.ts` nên đăng ký ở đây (giống `resources` tự dựng DI riêng cho job). Không đăng ký processor mới: cặp
 * queue/jobName `notifications/report.events` chỉ có MỘT processor (của `moderation`).
 */
registerStudyIntegrations();
