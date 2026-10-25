/**
 * Barrel của module `contribution` (p4-06 Báo cáo đóng góp & heatmap). `registerContributionModule()` — side-effect boot cho tiến trình API:
 * đăng ký loại thông báo `contribution.export-ready|failed` và quyền đọc asset `CONTRIBUTION_EXPORT` (quyền đọc bảng, `shared/ports/asset-target-access.port`).
 * Job/worker tự nối ở `register-jobs.ts` (`jobs/contribution.jobs.ts`).
 */
import { registerAssetTargetReadResolver } from "../../shared/ports/asset-target-access.port";
import { getContributionContainer } from "./contribution.container";
import { registerContributionNotificationTypes } from "./notifications/contribution.notification-types";

export function registerContributionModule(): void {
  registerContributionNotificationTypes();
  registerAssetTargetReadResolver("CONTRIBUTION_EXPORT", getContributionContainer().assetReadResolver);
}
