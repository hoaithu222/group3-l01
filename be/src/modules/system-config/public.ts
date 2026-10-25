/**
 * Barrel CÔNG KHAI của module `system-config` — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật "modules KHÔNG import chéo module" (cùng cơ chế
 * `@modules/assets/public`, `@modules/moderation/public`): module khác có màn quản trị RIÊNG ghi vào MỘT khoá registry (vd
 * `gamification` ghi `gamification.level` qua `PUT /admin/gamification/levels`) dùng đúng đường ghi này để có kiểm floor/ceil,
 * CAS `version`, xoá cache đa instance và audit `system-config.update` — KHÔNG tự ghi `SystemConfig` bằng Prisma.
 * Đọc giá trị hiệu lực ở đường nóng: `runtimeConfig.getEffective(key)` (`@core/config/runtime-config`).
 */
import { AuditService } from "../audit-log/audit-log.service";
import { PrismaSystemConfigRepository } from "./repositories/system-config.repository.prisma";
import { SystemConfigService } from "./services/system-config.service";

export type { SystemConfigDto, SystemConfigActor } from "./services/system-config.service";

/** Cùng DI với `system-config.routes.ts` (repo Prisma + `AuditService`). */
export function createSystemConfigService(): SystemConfigService {
  return new SystemConfigService(new PrismaSystemConfigRepository(), new AuditService());
}
