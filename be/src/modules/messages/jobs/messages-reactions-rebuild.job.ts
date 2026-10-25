import { defineCron, registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { PrismaReactionRepository } from "../repositories/reaction.repository.prisma";

const reactionRepo = new PrismaReactionRepository();

/**
 * `messages.reactions-rebuild` (queue `cron`, tuần — be.md §7) — rebuild
 * `reactionsSummary` từ `MessageReaction` cho tin ≤ 30 ngày. Sửa sai lệch
 * hiếm gặp (crash giữa lúc `reactionRepo.add/remove` và
 * `messageRepo.updateReactionsSummary` trong CÙNG transaction — về lý thuyết
 * không xảy ra vì cùng 1 tx Mongo, nhưng job này là lưới an toàn bổ sung
 * đúng như be.md yêu cầu).
 */
registerJob("cron", "messages.reactions-rebuild", async () => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const messages = await prisma.message.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    select: { id: true },
  });

  let fixed = 0;
  for (const m of messages) {
    const summary = await reactionRepo.summarize(m.id);
    await prisma.message.update({ where: { id: m.id }, data: { reactionsSummary: summary } });
    fixed += 1;
  }
  logger.info("[messages.reactions-rebuild] Đã rebuild reactionsSummary", { count: fixed });
});

defineCron({
  schedulerId: "messages.reactions-rebuild",
  queue: "cron",
  jobName: "messages.reactions-rebuild",
  pattern: "0 3 * * 0",
  opts: { attempts: 1 },
});
