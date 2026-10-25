import { registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";

interface BackfillPayload {
  channelId: string;
  workspaceId: string;
}

const BATCH_SIZE = 500;

/**
 * `channel.default-backfill` (queue `cron`) — be.md §5.3/§7. Kích hoạt khi
 * `channel-lifecycle.service.ts#archive()` đổi kênh mặc định (có
 * `replacementDefaultChannelId`) — thêm `ChannelMembership` kênh mặc định MỚI
 * cho mọi thành viên workspace ACTIVE, batch 500, `upsert` theo
 * `(channelId,userId)` nên idempotent (retry/`jobId` trùng không tạo trùng dữ liệu).
 */
registerJob("cron", "channel.default-backfill", async (job) => {
  const { channelId, workspaceId } = job.data as BackfillPayload;
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    logger.warn("[channel.default-backfill] kênh không còn tồn tại, bỏ qua", { channelId });
    return;
  }

  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const page = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, userId: true },
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (page.length === 0) break;

    for (const { userId } of page) {
      await prisma.channelMembership.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, workspaceId, userId },
        update: {},
      });
    }

    processed += page.length;
    cursor = page[page.length - 1]?.id;
    if (page.length < BATCH_SIZE) break;
  }

  const memberCount = await prisma.channelMembership.count({ where: { channelId } });
  await prisma.channel.update({ where: { id: channelId }, data: { memberCount } });

  logger.info("[channel.default-backfill] Hoàn tất", { channelId, processed });
});
