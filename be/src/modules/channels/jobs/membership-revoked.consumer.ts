import { withTransaction } from "../../../infrastructure/database";
import { registerJob, enqueue } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { logger } from "../../../infrastructure/logger";

interface MembershipRevokedPayload {
  workspaceId: string;
  userId: string;
}

/**
 * `channel.membership-revoked` (queue `notifications`) — be.md §5.7/§7. Kích
 * hoạt bởi `membership-lifecycle.service.ts#revokeInTx()` (module `members`) —
 * xem ghi chú tại chỗ gọi `outbox.add(tx, { jobName: "channel.membership-revoked", ... })`
 * ngay dưới outbox `membership.revoked` gốc (2 outbox row riêng biệt trong
 * CÙNG transaction, giống cách `notify()` ghi thêm 1 row nữa cạnh outbox
 * nghiệp vụ chính — KHÔNG thể dùng chung `jobName: "membership.events"` vì
 * `registerJob()` chỉ giữ ĐÚNG 1 processor cho mỗi cặp queue/jobName, đăng ký
 * lần 2 sẽ ghi đè handler của module `members`).
 *
 * Dọn `ChannelGrant`/`ChannelMembership` của user trong TOÀN BỘ kênh (công
 * khai lẫn riêng tư) của workspace đó; bump version riêng những kênh RIÊNG TƯ
 * bị ảnh hưởng (kênh công khai không cần — quyền của nó suy hoàn toàn từ vai
 * trò WORKSPACE, đã tự mất hiệu lực qua `versionDeps` khi WORKSPACE bị revoke);
 * enqueue `channel.orphan-check` cho kênh nào user vừa mất chức MANAGER cuối.
 */
registerJob("notifications", "channel.membership-revoked", async (job) => {
  const { workspaceId, userId } = job.data as MembershipRevokedPayload;

  const { affectedChannelIds, privateChannelIds, orphanCandidateIds } = await withTransaction(async (tx) => {
    const [memberships, grants] = await Promise.all([
      tx.channelMembership.findMany({ where: { workspaceId, userId }, select: { channelId: true } }),
      tx.channelGrant.findMany({ where: { workspaceId, userId }, select: { channelId: true, level: true } }),
    ]);

    await tx.channelGrant.deleteMany({ where: { workspaceId, userId } });
    await tx.channelMembership.deleteMany({ where: { workspaceId, userId } });

    for (const { channelId } of memberships) {
      await tx.channel.update({ where: { id: channelId }, data: { memberCount: { decrement: 1 } } });
    }

    return {
      affectedChannelIds: memberships.map((m) => m.channelId),
      privateChannelIds: grants.map((g) => g.channelId),
      orphanCandidateIds: grants.filter((g) => g.level === "MANAGER").map((g) => g.channelId),
    };
  });

  for (const channelId of privateChannelIds) {
    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
  }

  for (const channelId of orphanCandidateIds) {
    await enqueue("cron", "channel.orphan-check", { channelId }, { jobId: `channel.orphan-check:channel:${channelId}` });
  }

  if (affectedChannelIds.length > 0) {
    logger.info("[channel.membership-revoked] Đã dọn grant/membership kênh", {
      workspaceId,
      userId,
      channelCount: affectedChannelIds.length,
    });
  }
});
