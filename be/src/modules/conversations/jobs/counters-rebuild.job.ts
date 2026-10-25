import { defineCron, registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";

/**
 * `conversations.counters-rebuild` (queue `cron`, hằng đêm 03:00 — be.md
 * §7/README §10 "rủi ro") — tính lại `memberCount`/`lastSeq`/`unreadCount`
 * (số liệu phi chuẩn hoá) từ nguồn cho hội thoại có hoạt động 24h gần nhất.
 * Lưới an toàn bổ sung (giống `messages.reactions-rebuild`) — 1 hội thoại lỗi
 * không chặn cả lượt chạy.
 */
registerJob("cron", "conversations.counters-rebuild", async () => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ activityAt: { gte: since } }, { updatedAt: { gte: since } }] },
    select: { id: true },
  });

  let fixed = 0;
  for (const { id } of conversations) {
    try {
      const [memberCount, lastMessage] = await Promise.all([
        prisma.conversationMember.count({ where: { conversationId: id, status: "ACTIVE" } }),
        prisma.message.findFirst({
          where: { scopeType: "CONVERSATION", scopeId: id, threadKey: "root" },
          orderBy: { seq: "desc" },
          select: { seq: true },
        }),
      ]);
      await prisma.conversation.update({
        where: { id },
        data: { memberCount, ...(lastMessage && { lastSeq: lastMessage.seq }) },
      });

      const members = await prisma.conversationMember.findMany({ where: { conversationId: id, status: "ACTIVE" } });
      for (const member of members) {
        const unreadCount = await prisma.message.count({
          where: {
            scopeType: "CONVERSATION",
            scopeId: id,
            threadKey: "root",
            seq: { gt: member.lastReadSeq },
            deletedAt: null,
            ...(member.userId && { authorId: { not: member.userId } }),
          },
        });
        if (unreadCount !== member.unreadCount) {
          await prisma.conversationMember.update({ where: { id: member.id }, data: { unreadCount } });
        }
      }
      fixed += 1;
    } catch (err) {
      logger.warn("[conversations.counters-rebuild] Lỗi tính lại 1 hội thoại, bỏ qua", {
        conversationId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[conversations.counters-rebuild] Hoàn tất", { total: conversations.length, fixed });
});

defineCron({
  schedulerId: "conversations.counters-rebuild",
  queue: "cron",
  jobName: "conversations.counters-rebuild",
  pattern: "0 3 * * *",
  opts: { attempts: 1 },
});
