import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { PrismaChannelRepository, PrismaChannelGrantRepository } from "../repositories";
import { PrismaChannelRoleAudience } from "../services/channel-role-audience";
import { ChannelRoleGrantService } from "../services/channel-role-grant.service";

interface RoleAccessSyncPayload {
  workspaceId: string;
  userId: string;
}

/**
 * `channel.role-access-sync` (queue `notifications`, p3-04 be.md §5.2/§7) — kích hoạt bởi
 * `membership-lifecycle.service.ts#changeRole()` (module `members`, outbox row RIÊNG cạnh `membership.role-changed`,
 * cùng lý do như `channel.membership-revoked`: mỗi cặp queue/jobName chỉ có 1 processor).
 *
 * Tính lại quyền đọc kênh riêng tư của người vừa đổi vai trò từ trạng thái DB HIỆN TẠI (idempotent, retry an toàn):
 * mất quyền → `revokeScope` + `channel:revoked`; có quyền mới → vào room `ch:` + `channel:granted` (RB-09).
 * Job file tự `new` DI riêng (tiến trình worker không import `router.ts`).
 */
const service = new ChannelRoleGrantService(
  new PrismaChannelRepository(),
  new PrismaChannelGrantRepository(),
  new PrismaChannelRoleAudience()
);

registerJob("notifications", "channel.role-access-sync", async (job) => {
  const { workspaceId, userId } = job.data as RoleAccessSyncPayload;
  const result = await service.syncUserAfterRoleChange(workspaceId, userId);
  if (result.granted.length > 0 || result.revoked.length > 0) {
    logger.info("[channel.role-access-sync] Đã đồng bộ quyền kênh theo vai trò", {
      workspaceId,
      userId,
      granted: result.granted.length,
      revoked: result.revoked.length,
    });
  }
});
