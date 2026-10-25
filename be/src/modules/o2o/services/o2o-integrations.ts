import { ForbiddenError } from "../../../core/exceptions";
import { roleHasPermission, type PermissionKey } from "../../../core/constants/permissions";
import { registerDataPermissionProvider } from "../../../core/permission/data-permissions";
import { registerAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";
import { registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import { isTerminal, SHOP_FILE_READ_STATUSES } from "../domain/print-order.state-machine";
import type { O2oDeps } from "./o2o.deps";

export const PARTNER_PERMISSIONS: readonly PermissionKey[] = ["partner:view", "partner:update"];

/**
 * Điểm nối của `o2o` vào lõi (gọi 1 lần ở API — idempotent vì mọi registry là `Map.set`):
 * - provider quyền theo dữ liệu `print-shop`: sở hữu ≥ 1 `PrintShop` APPROVED ⇒ `partner:view` + `partner:update` (D-05);
 * - resolver đọc asset `PRINT_ORDER`: chủ đơn (khi đơn chưa kết thúc / còn hạn), chủ tiệm khi ACCEPTED/PRINTING/READY hoặc còn trong
 *   `fileAccessUntil` sau khi đã từng nhận đơn — tiệm KHÔNG đọc được tệp trước khi nhận (IR-08);
 * - gate scope `LOCATION` (ảnh địa điểm): chỉ người có `o2o:update` theo vai hệ thống.
 */
export function registerO2oIntegrations(deps: O2oDeps): void {
  registerDataPermissionProvider({
    name: "print-shop",
    resources: ["partner"],
    forUser: async (userId) => ((await deps.shops.hasApprovedForOwner(userId)) ? [...PARTNER_PERMISSIONS] : []),
  });

  registerAssetTargetReadResolver("PRINT_ORDER", {
    canRead: async (user, link) => {
      const order = await deps.orders.findById(link.targetId);
      if (!order) return false;
      const now = deps.now().getTime();
      const inGrace = order.fileAccessUntil !== null && now < order.fileAccessUntil.getTime();
      if (order.userId === user.id) return !isTerminal(order.status) || inGrace;
      if (order.shopOwnerId !== user.id) return false;
      if (SHOP_FILE_READ_STATUSES.includes(order.status)) return true;
      return inGrace && order.events.some((e) => e.status === "ACCEPTED");
    },
  });

  registerAssetScopeGate("LOCATION", {
    beforeCreate: async ({ ownerId }) => {
      const user = await deps.directory.findUser(ownerId);
      if (!user || !roleHasPermission(user.role, "o2o:update")) throw new ForbiddenError("Bạn không có quyền tải ảnh địa điểm");
    },
  });
}
