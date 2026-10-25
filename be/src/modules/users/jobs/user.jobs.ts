import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { prisma } from "../../../infrastructure/database";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import { UserAnonymizer } from "../services/user-anonymizer";

const anonymizer = new UserAnonymizer();

/** Một lô nhỏ mỗi lần chạy — job lặp hàng ngày, không cần dọn hết trong 1 tick. */
const BATCH_SIZE = 100;

interface DisconnectUserPayload {
  userId: string;
  reason: string;
}

/**
 * `realtime.disconnect-user` (queue `notifications`) — tiêu thụ outbox
 * `user.session-invalidated` (be.md p0-01 §5.2/§7). Idempotent: ngắt socket
 * nhiều lần cho cùng 1 user vô hại (`disconnectUserSockets` chạy được ở worker
 * qua cầu nối Redis — p0-03 — và tự nuốt lỗi nếu chưa có đường nào tới Socket.IO).
 */
registerJob("notifications", "realtime.disconnect-user", (job) => {
  const { userId, reason } = job.data as DisconnectUserPayload;
  disconnectUserSockets(userId, reason);
  return Promise.resolve();
});

/**
 * `user.anonymize` (cron `0 3 * * *` Asia/Ho_Chi_Minh — be.md §5.5/§7): quét
 * user `PENDING_DELETION` đã quá `deletionGraceUntil`, ẩn danh hoá từng user
 * qua `UserAnonymizer` (idempotent theo `anonymizedAt`). Lỗi 1 user KHÔNG
 * chặn user khác trong cùng lô (be.md: "lỗi một user không chặn user khác").
 */
registerJob("cron", "user.anonymize", async () => {
  const now = new Date();
  const due = await prisma.user.findMany({
    where: { status: "PENDING_DELETION", deletionGraceUntil: { lte: now } },
    select: { id: true },
    take: BATCH_SIZE,
  });

  let okCount = 0;
  for (const { id } of due) {
    try {
      await anonymizer.anonymize(id);
      okCount += 1;
    } catch (err) {
      logger.error("[user.anonymize] Ẩn danh hoá 1 user thất bại — bỏ qua, tiếp tục user khác", {
        userId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[user.anonymize] Hoàn tất", { scanned: due.length, okCount });
});

defineCron({
  schedulerId: "user.anonymize",
  queue: "cron",
  jobName: "user.anonymize",
  pattern: "0 3 * * *",
  opts: { attempts: 1 },
});
