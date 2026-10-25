import { getO2oContainer } from "./o2o.container";
import { registerO2oIntegrations } from "./services/o2o-integrations";
import { registerO2oNotificationTypes } from "./services/o2o-notifications";

let registered = false;

/**
 * (p6-05) Đăng ký phần `o2o` cần có ở tiến trình API: loại thông báo `print-order.*`, provider quyền theo dữ liệu `print-shop`
 * (`partner:*`), resolver đọc asset `PRINT_ORDER`, gate scope `LOCATION`. Gọi từ `o2o.routes.ts` (import) và `router.ts`; idempotent.
 * Worker chỉ cần loại thông báo — nạp qua `jobs/o2o.jobs.ts`.
 */
export function registerO2oModule(): void {
  if (registered) return;
  registered = true;
  registerO2oNotificationTypes();
  registerO2oIntegrations(getO2oContainer().deps);
}

export { PARTNER_PERMISSIONS } from "./services/o2o-integrations";
