import { ForbiddenError } from "../../../core/exceptions";
import { roleHasPermission } from "../../../core/constants/permissions";
import { registerAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";
import { registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { IGamDirectory } from "../repositories/directory";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";

/**
 * Điểm nối của `gamification` vào module `assets` (p4-03 be.md §12) — gọi 1 lần ở API (`gamification.routes.ts`), idempotent (mọi registry là `Map.set`):
 * - gate scope `BADGE` (ảnh huy hiệu): chỉ người có `gamification:update` theo vai hệ thống được xin URL upload (chặn TRƯỚC khi cấp URL);
 * - resolver đọc asset `BADGE_ICON`: ảnh huy hiệu là dữ liệu công khai của danh mục — mọi người đăng nhập đọc được khi huy hiệu còn tồn tại
 *   (người khác trưng bày huy hiệu đã tắt vẫn thấy ảnh; huy hiệu không còn → 404 như không có tệp). Chưa đăng ký (worker) → link `scopeType NONE`
 *   chỉ chủ asset đọc (fail-closed).
 */
export function registerGamificationIntegrations(deps: { badges: IBadgeRepository; directory: IGamDirectory }): void {
  registerAssetScopeGate("BADGE", {
    beforeCreate: async ({ ownerId }) => {
      const role = await deps.directory.getRole(ownerId);
      if (role === null || !roleHasPermission(role, "gamification:update")) throw new ForbiddenError("Bạn không có quyền tải ảnh huy hiệu");
    },
  });

  registerAssetTargetReadResolver("BADGE_ICON", {
    canRead: async (_user, link) => (await deps.badges.findById(link.targetId)) !== null,
  });
}
