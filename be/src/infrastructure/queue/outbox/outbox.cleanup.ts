import { prisma } from "../../database";
import { logger } from "../../logger";
import { LIMITS } from "../../../core/constants/limits";
import { registerJob } from "../worker";
import { defineCron } from "../cron.registry";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `outbox.cleanup` (queue `cron`, `30 2 * * *` — be.md §7): xoá `OutboxEvent`
 * đã xử lý xong (`DISPATCHED`) quá `retentionDays`, và `FAILED` quá
 * `failedRetentionDays` — giữ lâu hơn để còn điều tra/`requeue` thủ công qua
 * `admin-jobs`. Schema không có mốc "lúc chuyển FAILED" riêng, dùng
 * `createdAt` làm mốc tính hạn (event FAILED không còn bị relay đụng vào nên
 * `createdAt` là mốc ổn định duy nhất sẵn có).
 */
registerJob("cron", "outbox.cleanup", async () => {
  const now = Date.now();
  const dispatchedCutoff = new Date(now - LIMITS.outbox.retentionDays * DAY_MS);
  const failedCutoff = new Date(now - LIMITS.outbox.failedRetentionDays * DAY_MS);

  const [dispatched, failed] = await Promise.all([
    prisma.outboxEvent.deleteMany({
      where: { status: "DISPATCHED", dispatchedAt: { lt: dispatchedCutoff } },
    }),
    prisma.outboxEvent.deleteMany({
      where: { status: "FAILED", createdAt: { lt: failedCutoff } },
    }),
  ]);

  logger.info("[outbox.cleanup] Đã dọn OutboxEvent cũ", {
    dispatchedDeleted: dispatched.count,
    failedDeleted: failed.count,
  });
});

defineCron({
  schedulerId: "outbox.cleanup",
  queue: "cron",
  jobName: "outbox.cleanup",
  pattern: "30 2 * * *",
  opts: { attempts: 1 },
});
