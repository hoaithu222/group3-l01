import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerAnnouncementNotificationTypes } from "../announcement.notification-types";
import { PrismaAnnouncementLookupRepository, PrismaAnnouncementRepository } from "../repositories/announcement.repository.prisma";
import { AnnouncementNotifyService } from "../services/announcement-notify.service";

/**
 * Job của yêu cầu xác nhận đã đọc (queue `notifications`, p5-04 be.md §7):
 *  - `announcement.notify` — fan-out `announcement.required` tới người đọc được kênh; jobId = dedupeKey outbox
 *    `announcement.notify:msg:<messageId>` (relay đổi `:` → `_`); payload `{ messageId }`.
 *  - `announcement.deadline-remind` — outbox `availableAt = hạn − 24 giờ`; payload `{ messageId, deadlineAt }`; chỉ nhắc người CHƯA xác nhận,
 *    tự bỏ qua khi yêu cầu đã huỷ/đổi hạn/hết hạn.
 * Job file tự `new` DI riêng (tiến trình worker không import `router.ts`); audience tính thẳng từ dữ liệu (`channelReaderIds`), không phụ
 * thuộc registry `MessageScope` — nên chạy đúng cả ở worker riêng.
 */
registerAnnouncementNotificationTypes();

const lookup = new PrismaAnnouncementLookupRepository();
const service = new AnnouncementNotifyService(new PrismaAnnouncementRepository(), lookup, (channelId) => lookup.channelReaderIds(channelId));

registerJob("notifications", "announcement.notify", async (job) => {
  const { messageId } = job.data as { messageId: string };
  const stats = await service.notifyRequired(messageId);
  logger.debug("[announcement.notify] Hoàn tất", { messageId, ...stats });
});

registerJob("notifications", "announcement.deadline-remind", async (job) => {
  const { messageId, deadlineAt } = job.data as { messageId: string; deadlineAt: string };
  const stats = await service.remind(messageId, deadlineAt);
  logger.debug("[announcement.deadline-remind] Hoàn tất", { messageId, ...stats });
});
