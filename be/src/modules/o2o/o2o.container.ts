import { AuditService } from "../audit-log/audit-log.service";
import { PrismaLocationRepository } from "./repositories/location.repository.prisma";
import { PrismaLocationReviewRepository } from "./repositories/location-review.repository.prisma";
import { PrismaPrintShopRepository } from "./repositories/print-shop.repository.prisma";
import { PrismaPrintOrderRepository } from "./repositories/print-order.repository.prisma";
import { PrismaO2oDirectory } from "./repositories/o2o-directory";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { DataPermissionCacheAdapter, NotifyAdapter, PermissionResourceAccess, PublicAssetsAdapter } from "./o2o.adapters";
import type { O2oDeps } from "./services/o2o.deps";
import { RedisPinLockout } from "./services/pin-lockout";
import { buildO2oServices, type O2oServices } from "./o2o.services";

export function createO2oDeps(): O2oDeps {
  return {
    locations: new PrismaLocationRepository(),
    reviews: new PrismaLocationReviewRepository(),
    shops: new PrismaPrintShopRepository(),
    orders: new PrismaPrintOrderRepository(),
    directory: new PrismaO2oDirectory(),
    access: new PermissionResourceAccess(),
    assets: new PublicAssetsAdapter(),
    pinLockout: new RedisPinLockout(),
    notifier: new NotifyAdapter(),
    audit: new AuditService(),
    dataPermissions: new DataPermissionCacheAdapter(),
    tx: new PrismaTxRunner(),
    outbox: new PrismaOutboxPort(),
    now: () => new Date(),
  };
}

let container: { deps: O2oDeps; services: O2oServices } | null = null;

/**
 * DI dùng CHUNG cho routes và job (tiến trình worker riêng không import routes — tự dựng lại qua hàm này). Không có DI container
 * trong codebase (mẫu `getWalletContainer`).
 */
export function getO2oContainer(): { deps: O2oDeps; services: O2oServices } {
  if (!container) {
    const deps = createO2oDeps();
    container = { deps, services: buildO2oServices(deps) };
  }
  return container;
}
