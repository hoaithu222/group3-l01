/**
 * Barrel của module `portfolio` (p6-07 Portfolio một chạm). `registerPortfolioModule()` — side-effect boot của tiến trình API: loại thông báo `portfolio.build-failed|taken-down` và đích báo cáo
 * `PORTFOLIO` (`shared/ports/report.port`). Job/worker/sink tự nối ở `register-jobs.ts` (`jobs/portfolio.jobs.ts`). Module khác dùng `portfolio/public.ts` (không import `services/*`).
 */
import { registerReportTargetExtension } from "../../shared/ports/report.port";
import { registerPortfolioNotificationTypes } from "./notifications/portfolio.notification-types";
import { getPortfolioContainer } from "./portfolio.container";
import { PORTFOLIO_REPORT_TARGET, PortfolioReportTarget } from "./services/portfolio-report-target";

export function registerPortfolioModule(): void {
  registerPortfolioNotificationTypes();
  registerReportTargetExtension(PORTFOLIO_REPORT_TARGET, new PortfolioReportTarget(getPortfolioContainer().portfolios));
}
