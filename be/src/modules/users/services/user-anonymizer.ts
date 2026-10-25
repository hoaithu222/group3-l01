import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { invalidateUserStatusCache } from "../../../core/permission/user-status";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import { NotFoundError } from "../../../core/exceptions";
import { createAssetLinkService } from "../../assets/public";

/** Consumer `user.anonymized` theo module (queue/jobName do module đó đăng ký bằng `registerJob`). */
const USER_ANONYMIZED_CONSUMERS = [
  { queue: "cron", jobName: "study.user-anonymized" },
  { queue: "gamification", jobName: "gamification.user-anonymized" },
  // p6-06: xoá credit/tiến độ/huy hiệu kỹ năng/hồ sơ nghề nghiệp (processor idempotent ở `career/jobs/career.jobs.ts`, queue `gamification`).
  { queue: "gamification", jobName: "career.user-anonymized" },
  // p1-09: xoá danh sách tin đã lưu (`SavedMessage`) của user — processor idempotent ở `discovery/jobs/saved-user-anonymized.consumer.ts`.
  { queue: "reports", jobName: "discovery.user-anonymized" },
  // p6-07: gỡ portfolio (trang 404, xoá object build + dự án + link ảnh, giữ slug 30 ngày) — processor idempotent ở `portfolio/jobs/portfolio.jobs.ts`, queue `notifications`.
  { queue: "notifications", jobName: "portfolio.on-user-anonymized" },
  // p6-08: xoá bản chiếu tìm kiếm/chặn/lượt xem, khoá lời mời, gỡ nhân sự công ty (OWNER cuối cùng → tạm ngưng công ty) — processor idempotent ở `recruiter/jobs/recruiter.jobs.ts`, queue `notifications`.
  { queue: "notifications", jobName: "recruiter.on-user-anonymized" },
  // p7-04: huỷ tin hẹn giờ/nhắc đang chờ (xoá nội dung + gỡ AssetLink), xoá phiếu bầu (giữ số đếm) — processor idempotent ở `chat-extensions/jobs/chat-extensions.jobs.ts`, queue `notifications`.
  { queue: "notifications", jobName: "chat-extensions.on-user-anonymized" },
  // p7-03: xoá SẠCH dữ liệu sức khoẻ học tập (chỉ số ngày, đánh giá, bucket Redis) + dòng cài đặt theo dõi — processor idempotent ở `burnout/jobs/burnout.jobs.ts`, queue `gamification`.
  { queue: "gamification", jobName: "wellbeing.user-anonymized" },
] as const;

/**
 * `UserAnonymizer` — logic ghi đè PII sau ân hạn xoá tài khoản (D-02, be.md
 * p0-01 §5.5). Thao tác xuyên nhiều collection (User + Session + BiometricCredential +
 * DeviceToken + NotificationPreference + OutboxEvent) trong 1 transaction ATOMIC nên đi
 * thẳng `prisma`/`withTransaction`/`outbox` thay vì qua `IUserRepository`
 * (chỉ bao User) — cùng lý do `SessionService` (module auth) đã đụng thẳng
 * `prisma.user.update` cho `sessionVersion`; đây là 1 ngoại lệ hẹp, có chủ
 * đích cho nghiệp vụ xoá-vĩnh-viễn xuyên aggregate, không phải mẫu chung cho
 * các service khác.
 */
export class UserAnonymizer {
  /**
   * Ẩn danh hoá 1 user — idempotent theo `anonymizedAt` (SEC-10): gọi lại
   * lần 2 trả về mốc thời gian CŨ, không ghi đè lần nữa.
   */
  async anonymize(userId: string): Promise<Date> {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { anonymizedAt: true },
    });
    if (!existing) throw new NotFoundError("Không tìm thấy người dùng");
    if (existing.anonymizedAt) return existing.anonymizedAt;

    const now = new Date();

    await withTransaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@anon.local`,
          name: "Tài khoản đã xoá",
          normalizedName: "tai khoan da xoa",
          // Số điện thoại là dữ liệu cá nhân (tra cứu được) — xoá cùng email/tên khi ẩn danh hoá.
          phone: null,
          avatarAssetId: null,
          passwordHash: null,
          verificationToken: null,
          verificationTokenExpires: null,
          privacy: null,
          status: "ANONYMIZED",
          anonymizedAt: now,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.session.deleteMany({ where: { userId } });
      // p0-13/D-26: mọi credential sinh trắc học (chỉ có `secretHash`, gắn `deviceId`) bị XOÁ — không giữ lại dữ liệu thiết bị của
      // tài khoản đã ẩn danh hoá (mode NOW gọi thẳng anonymizer, không qua `SessionService.revokeAll` nên nếu không xoá ở đây
      // credential còn ACTIVE mãi).
      await tx.biometricCredential.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      // p6-04: số tài khoản ngân hàng (đã mã hoá) là dữ liệu cá nhân — không giữ lại sau khi ẩn danh hoá.
      // `ExpenseShare`/`Settlement` được GIỮ (D-02: số dư nhóm vẫn đúng, chỉ mất danh tính).
      await tx.userPaymentProfile.deleteMany({ where: { userId } });

      // Gỡ `AssetLink(USER_AVATAR)` (be.md §5.5 bước 2): asset ảnh đại diện vào hạn dọn của `assets.cleanup` (`markUnlinked`) thay vì nằm mồ côi mãi trong kho.
      // `avatarAssetId` đã đặt null ở trên nên `GET /users/:id/avatar` cũng không còn trỏ tới ảnh cũ. Idempotent (không có link ⇒ không làm gì).
      await createAssetLinkService().detachAll(tx, { targetType: "USER_AVATAR", targetId: userId });
      await outbox.add(tx, {
        type: "user.anonymized",
        aggregateType: "User",
        aggregateId: userId,
        // NOTE: chưa module Phase 1 nào tiêu thụ event này (be.md §5.5 bước 3:
        // "Module Phase 1+ tiêu thụ user.anonymized"). Event vẫn được ghi bền
        // ở đây để KHÔNG phải sửa lại `UserAnonymizer` khi module đó tới lượt
        // — cho tới lúc đó, job BullMQ tương ứng sẽ fail "không có processor"
        // (không chặn nghiệp vụ chính, chỉ là log lỗi vô hại — xem README §10).
        queue: "notifications",
        jobName: "user.anonymized",
        dedupeKey: `user.anonymized:user:${userId}`,
        payload: { userId },
      });
      // p4-02/p4-03 — mỗi module tiêu thụ nhận MỘT dòng outbox RIÊNG trong cùng transaction: mỗi cặp (queue, jobName) chỉ có MỘT
      // processor và `dedupeKey` outbox là unique nên KHÔNG dùng chung dòng `user.anonymized` ở trên (chưa có processor).
      for (const consumer of USER_ANONYMIZED_CONSUMERS) {
        await outbox.add(tx, {
          type: "user.anonymized",
          aggregateType: "User",
          aggregateId: userId,
          queue: consumer.queue,
          jobName: consumer.jobName,
          dedupeKey: `${consumer.jobName}:user:${userId}`,
          payload: { userId },
        });
      }
    });

    await invalidateUserStatusCache(userId);
    disconnectUserSockets(userId, "account-anonymized");

    return now;
  }
}
