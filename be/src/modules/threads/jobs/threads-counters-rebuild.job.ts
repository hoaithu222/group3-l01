import { defineCron, registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";

/**
 * `threads.counters-rebuild` (queue `cron`, hằng đêm 03:30 — be.md §7) — tính
 * lại `replyCount`/`lastReplySeq`/`lastReplyAt`/`lastReplierIds` (số liệu phi
 * chuẩn hoá) từ nguồn (`Message.threadKey = Thread.parentMessageId`) cho
 * thread có hoạt động 24h gần nhất. Lưới an toàn bổ sung (giống
 * `messages.reactions-rebuild`/`conversations.counters-rebuild`) — 1 thread
 * lỗi không chặn cả lượt chạy. `replyCount` đếm CẢ tin đã thu hồi (be.md §2
 * "thu hồi reply KHÔNG giảm replyCount" — tránh nhảy số).
 */
registerJob("cron", "threads.counters-rebuild", async () => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const threads = await prisma.thread.findMany({
    where: { OR: [{ updatedAt: { gte: since } }, { lastReplyAt: { gte: since } }] },
    select: { id: true, parentMessageId: true },
  });

  let fixed = 0;
  for (const t of threads) {
    try {
      const [replyCount, recent] = await Promise.all([
        prisma.message.count({ where: { scopeType: "CHANNEL", threadKey: t.parentMessageId } }),
        prisma.message.findMany({
          where: { scopeType: "CHANNEL", threadKey: t.parentMessageId },
          orderBy: { seq: "desc" },
          take: 20,
          select: { seq: true, authorId: true, createdAt: true },
        }),
      ]);
      const last = recent[0];
      if (!last) continue;

      const lastReplierIds: string[] = [];
      for (const r of recent) {
        if (r.authorId && !lastReplierIds.includes(r.authorId)) lastReplierIds.push(r.authorId);
        if (lastReplierIds.length >= LIMITS.thread.lastRepliersMax) break;
      }

      await prisma.thread.update({
        where: { id: t.id },
        data: { replyCount, lastReplySeq: last.seq, lastReplyAt: last.createdAt, lastReplierIds },
      });
      fixed += 1;
    } catch (err) {
      logger.warn("[threads.counters-rebuild] Lỗi tính lại 1 thread, bỏ qua", {
        threadId: t.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[threads.counters-rebuild] Hoàn tất", { total: threads.length, fixed });
});

defineCron({
  schedulerId: "threads.counters-rebuild",
  queue: "cron",
  jobName: "threads.counters-rebuild",
  pattern: "30 3 * * *",
  opts: { attempts: 1 },
});
