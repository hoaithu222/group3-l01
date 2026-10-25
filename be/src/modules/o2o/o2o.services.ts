import type { O2oDeps } from "./services/o2o.deps";
import { LocationsService } from "./services/locations.service";
import { PrintShopsService } from "./services/print-shops.service";
import { PrintOrdersService } from "./services/print-orders.service";
import { PrintOrderActionsService } from "./services/print-order-actions.service";
import { PartnerOrdersService } from "./services/partner-orders.service";
import { AdminLocationsService } from "./services/admin-locations.service";
import { AdminShopsService } from "./services/admin-shops.service";
import { AdminOrdersService } from "./services/admin-orders.service";
import { PageCountService } from "./services/page-count.service";
import { PrintOrderExpiryService } from "./services/print-order-expiry.service";

/** Dựng toàn bộ service từ `deps` — dùng chung bản Prisma (container) và bản in-memory (unit test). */
export function buildO2oServices(deps: O2oDeps) {
  return {
    locations: new LocationsService(deps),
    shops: new PrintShopsService(deps),
    orders: new PrintOrdersService(deps),
    orderActions: new PrintOrderActionsService(deps),
    partner: new PartnerOrdersService(deps),
    adminLocations: new AdminLocationsService(deps),
    adminShops: new AdminShopsService(deps),
    adminOrders: new AdminOrdersService(deps),
    pageCount: new PageCountService(deps),
    expiry: new PrintOrderExpiryService(deps),
  };
}
export type O2oServices = ReturnType<typeof buildO2oServices>;
