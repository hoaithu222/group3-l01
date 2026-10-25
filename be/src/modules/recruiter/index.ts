/**
 * Barrel của module `recruiter` (p6-08 Recruiter board). `registerRecruiterModule()` — side-effect boot, gọi ở CẢ API (`router.ts`) lẫn worker (`worker-registries.ts` / `jobs/recruiter.jobs.ts`):
 * loại thông báo `job-offer.*`/`company.*`, resolver scope `COMPANY` (PermissionService), provider quyền theo dữ liệu `company` (`recruiter:*`), đích báo cáo `COMPANY`/`JOB_OFFER`.
 * `registerRecruiterApiHooks()` — CHỈ API: quyền đọc asset `COMPANY_LOGO`/`JOB_OFFER` (URL ký do API phục vụ). Job/cron/sink của worker nạp ở `register-jobs.ts` (`jobs/recruiter.jobs.ts`).
 */
import { registerRecruiterNotificationTypes } from "./notifications/recruiter.notification-types";
import { getRecruiterContainer } from "./recruiter.container";
import { registerRecruiterAssetResolvers, registerRecruiterIntegrations } from "./services/recruiter-integrations";

export function registerRecruiterModule(): void {
  registerRecruiterNotificationTypes();
  registerRecruiterIntegrations(getRecruiterContainer().deps);
}

export function registerRecruiterApiHooks(): void {
  registerRecruiterAssetResolvers(getRecruiterContainer().deps);
}
