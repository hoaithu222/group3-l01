import { registerRevokeListener } from "../../../core/permission";
import { logger } from "../../../infrastructure/logger";
import { BullIntegrationJobs } from "../services/integration-jobs";

const TARGET_SCOPES = new Set(["WORKSPACE", "CHANNEL", "CONVERSATION"]);
const jobs = new BullIntegrationJobs();

/**
 * INT-06: mọi đường thu hồi quyền (`revokeScope` — rời/bị loại khỏi nhóm, thu hồi grant kênh riêng tư, rời nhóm chat…) → xếp job
 * `integrations.target-recheck` (bền, retry) để kiểm lại quyền GHI của người cấu hình vào đích; mất quyền → kết nối `ERROR` + thông báo, ngừng đăng tin.
 * Kể cả khi job bị mất, `webhook-process` vẫn kiểm lại đích trước MỖI lần đăng. Đăng ký ở CẢ API lẫn worker — idempotent theo tên.
 */
export function registerIntegrationRevokeListener(): void {
  registerRevokeListener("integrations.target-recheck", async (input) => {
    if (!TARGET_SCOPES.has(input.scope.type) || input.userIds.length === 0) return;
    try {
      await jobs.enqueueTargetRecheck({ scopeType: input.scope.type, scopeId: input.scope.id, userIds: input.userIds });
    } catch (err) {
      logger.warn("[integrations] Không xếp được target-recheck", { scope: input.scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
