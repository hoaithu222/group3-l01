import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { registerJob, defineCron } from "../../../infrastructure/queue";

/**
 * `invites.expire` (queue `cron`, mỗi giờ — be.md p1-02 §7). `InviteLink`
 * không có field `status` lưu sẵn (tính động qua `inviteStatusOf()` lúc đọc)
 * nên job này CHỈ đếm để log/thống kê — `InviteService.accept()`/`preview()`
 * đã tự kiểm `expiresAt` độc lập, không phụ thuộc job này để chặn dùng lời
 * mời hết hạn.
 */
registerJob("cron", "invites.expire", async () => {
  const now = new Date();
  const expiredCount = await prisma.inviteLink.count({
    where: { revokedAt: null, expiresAt: { lte: now }, remainingUses: { gt: 0 } },
  });
  logger.info("[invites.expire] Thống kê lời mời hết hạn", { expiredCount });
});

defineCron({
  schedulerId: "invites.expire",
  queue: "cron",
  jobName: "invites.expire",
  pattern: "0 * * * *",
  opts: { attempts: 1 },
});
