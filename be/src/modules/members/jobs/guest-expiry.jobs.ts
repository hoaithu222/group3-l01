import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { PrismaMembershipRepository } from "../repositories";
import { MembershipLifecycleService } from "../services/membership-lifecycle.service";
import { GuestExpiryService, type GuestNoticeInput } from "../services/guest-expiry.service";
import { GUEST_EXPIRE_JOB, GUEST_NOTICE_JOB } from "../services/guest-expiry.schedule";

/**
 * Vòng đời hết hạn KHÁCH (be.md p3-04 §5.4/§7). Job file tự `new` DI riêng (tiến trình worker không import `router.ts`).
 *
 * - `guest.expire` (queue `cron`): dòng outbox `availableAt = expiresAt` do `scheduleGuestExpiryInTx` ghi (accept / gia hạn) →
 *   relay đẩy vào BullMQ khi tới hạn. Kiểm lại `expiryVersion` (gia hạn → bỏ), idempotent.
 * - `guests.expire-sweep` (queue `cron`, mỗi 15 phút): MỘT job tick TĨNH quét khách quá hạn mà job hẹn giờ lỡ (Redis/relay
 *   mất nhịp). ⛔ KHÔNG tạo scheduler theo-thực-thể — `syncCronSchedulers()` xoá mọi scheduler không nằm trong registry tĩnh.
 * - `guest.expiring-notice` (queue `notifications`): thông báo trước hạn `LIMITS.guest.expiringNoticeHours` giờ.
 */
const memberships = new PrismaMembershipRepository();
const service = new GuestExpiryService(memberships, new MembershipLifecycleService(memberships), LIMITS.guest.expiringNoticeHours);

interface GuestJobPayload extends GuestNoticeInput {
  membershipId?: string;
}

registerJob("cron", GUEST_EXPIRE_JOB, async (job) => {
  const { workspaceId, userId, expiryVersion } = job.data as GuestJobPayload;
  const result = await service.expire(workspaceId, userId, expiryVersion);
  if (result === "EXPIRED") logger.info("[guest.expire] Khách đã hết hạn", { workspaceId, userId, expiryVersion });
});

registerJob("cron", "guests.expire-sweep", async () => {
  const { scanned, expired } = await service.sweep();
  if (scanned > 0) logger.info("[guests.expire-sweep] Quét khách quá hạn", { scanned, expired });
});

defineCron({
  schedulerId: "guests.expire-sweep",
  queue: "cron",
  jobName: "guests.expire-sweep",
  pattern: "*/15 * * * *",
  opts: { attempts: 1 },
});

registerJob("notifications", GUEST_NOTICE_JOB, async (job) => {
  const payload = job.data as GuestJobPayload;
  await service.notify({ workspaceId: payload.workspaceId, userId: payload.userId, expiryVersion: payload.expiryVersion });
});
