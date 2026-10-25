import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { PrismaChannelRepository, PrismaChannelMembershipRepository, PrismaChannelGrantRepository } from "../repositories";
import { ChannelLifecycleService } from "../services/channel-lifecycle.service";

const channelRepo = new PrismaChannelRepository();
const membershipRepo = new PrismaChannelMembershipRepository();
const grantRepo = new PrismaChannelGrantRepository();
const lifecycleService = new ChannelLifecycleService(channelRepo, membershipRepo, grantRepo);

interface OrphanCheckPayload {
  channelId: string;
}

/**
 * `channel.orphan-check` (queue `cron`) — be.md §5.8/§7. Enqueue trực tiếp
 * (không qua Outbox — mất cũng không sao, job kế tiếp cùng nguyên nhân sẽ tự
 * bắt lại) bởi `jobs/membership-revoked.consumer.ts` khi user rời/bị loại
 * workspace và đang là MANAGER của 1 kênh riêng tư. CAS ở `orphanCheck()` tự
 * idempotent — retry/gọi lại an toàn.
 */
registerJob("cron", "channel.orphan-check", async (job) => {
  const { channelId } = job.data as OrphanCheckPayload;
  const archived = await lifecycleService.orphanCheck(channelId);
  if (archived) {
    logger.info("[channel.orphan-check] Đã lưu trữ kênh do hết người quản lý", { channelId });
  }
});
