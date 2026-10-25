import { registerJob } from "../../../infrastructure/queue";
import { invalidateUnreadSummary } from "../../read-state/public";
import { PrismaNotificationRepository } from "../repositories";
import { NotificationService } from "../services/notification.service";

const service = new NotificationService(new PrismaNotificationRepository(), {
  inboxChanged: (userId) => invalidateUnreadSummary([userId]),
});

interface MarkReadByStreamJob {
  userId: string;
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  streamKey: string;
  seq: number;
}

/**
 * `notifications.mark-read-by-stream` (queue `notifications`, p1-07 be.md §5.8/§7) — do `ReadMarkerService` xếp
 * khi mốc đọc tiến: mục hộp thư (MENTION/THREAD_REPLY…) của tin ≤ `seq` trong luồng tự thành đã đọc (NT-12) và
 * phát `notification:read { ids }`. `updateMany` có điều kiện `readAt: null` nên chạy lại vô hại.
 */
registerJob("notifications", "notifications.mark-read-by-stream", async (job) => {
  const d = job.data as MarkReadByStreamJob;
  await service.markReadByStream(d.userId, d.scopeType, d.scopeId, d.streamKey, d.seq);
});
