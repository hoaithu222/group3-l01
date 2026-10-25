import { withTransaction } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { notify } from "../../notifications/public";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { MembershipLifecycleService } from "./membership-lifecycle.service";
import "./access-notification-types";

/** Lô quét bù mỗi lượt và số lô tối đa/lần chạy — chặn một lần chạy kéo dài khi tồn đọng lớn (lần sau tiếp tục). */
const SWEEP_BATCH = 100;
const SWEEP_MAX_BATCHES = 10;

export interface GuestNoticeInput {
  workspaceId: string;
  userId: string;
  expiryVersion: number;
}

/**
 * Vòng đời hết hạn của KHÁCH (be.md p3-04 §5.4): job hẹn giờ `guest.expire` (qua outbox `availableAt`), cron quét bù
 * `guests.expire-sweep` và thông báo trước hạn `guest.expiring-notice`. Việc thu hồi thật nằm ở
 * `MembershipLifecycleService.expireGuest` (dùng chung đường revoke với remove/ban/leave).
 */
export class GuestExpiryService {
  constructor(
    private readonly repo: IMembershipRepository,
    private readonly lifecycle: Pick<MembershipLifecycleService, "expireGuest">,
    private readonly noticeHours: number
  ) {}

  /** Job `guest.expire`: kiểm lại version/hạn trước khi gỡ (job cũ sau gia hạn → bỏ). */
  async expire(workspaceId: string, userId: string, expiryVersion: number): Promise<"EXPIRED" | "SKIPPED"> {
    return this.lifecycle.expireGuest(workspaceId, userId, { expectedVersion: expiryVersion });
  }

  /**
   * Cron `guests.expire-sweep` (mỗi 15 phút): quét khách quá hạn mà job hẹn giờ lỡ (Redis/relay mất nhịp). Idempotent —
   * dùng chung `expireGuest`; lỗi một khách không chặn các khách còn lại (log rồi đi tiếp, lượt sau thử lại).
   */
  async sweep(now: Date = new Date()): Promise<{ scanned: number; expired: number }> {
    let scanned = 0;
    let expired = 0;
    for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch += 1) {
      const rows = await this.repo.listExpiredGuests(now, SWEEP_BATCH);
      if (rows.length === 0) break;
      let progressed = false;
      for (const row of rows) {
        scanned += 1;
        try {
          const result = await this.lifecycle.expireGuest(row.workspaceId, row.userId, { now });
          if (result === "EXPIRED") {
            expired += 1;
            progressed = true;
          }
        } catch (err) {
          logger.error("[guests.expire-sweep] Không hết hạn được khách", {
            workspaceId: row.workspaceId,
            userId: row.userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      // Cả lô đều lỗi/bỏ qua → dừng, tránh vòng lặp vô ích trên cùng các dòng (lượt cron kế tiếp thử lại).
      if (!progressed || rows.length < SWEEP_BATCH) break;
    }
    return { scanned, expired };
  }

  /**
   * Job `guest.expiring-notice` (trước `expiresAt` `noticeHours` giờ): thông báo `guest.expiring` cho khách và người mời.
   * Bỏ qua khi khách không còn ACTIVE, đã gia hạn (version lệch) hoặc đã quá hạn. Idempotent theo `(membership, version)`.
   */
  async notify(input: GuestNoticeInput, now: Date = new Date()): Promise<"NOTIFIED" | "SKIPPED"> {
    const membership = await this.repo.findByWorkspaceAndUser(input.workspaceId, input.userId);
    if (!membership || membership.status !== "ACTIVE" || membership.role !== "GUEST" || !membership.expiresAt) return "SKIPPED";
    if ((membership.expiryVersion ?? 0) !== input.expiryVersion) return "SKIPPED";
    if (membership.expiresAt <= now) return "SKIPPED";

    const key = `guest-expiring:${membership.id}:v${input.expiryVersion}`;
    const recipients = [{ userId: membership.userId }];
    if (membership.invitedBy && membership.invitedBy !== membership.userId) recipients.push({ userId: membership.invitedBy });

    return withTransaction(async (tx) => {
      // `notify()` KHÔNG idempotent với outbox `deliver:<notificationId>:<userId>` (unique) — job chạy lại sẽ làm tx hỏng (P2002).
      if (await tx.notification.findUnique({ where: { dedupeKey: key }, select: { id: true } })) return "SKIPPED" as const;
      const workspace = await tx.workspace.findUnique({ where: { id: input.workspaceId }, select: { name: true } });
      await notify(tx, {
        type: PHASE3_NOTIFICATION_TYPES.GUEST_EXPIRING,
        scope: { type: "WORKSPACE", id: input.workspaceId },
        workspaceId: input.workspaceId,
        source: { type: "WorkspaceMembership", id: key },
        refs: {
          workspaceId: input.workspaceId,
          workspaceName: workspace?.name ?? "",
          guestUserId: membership.userId,
          expiresAt: membership.expiresAt?.toISOString(),
          noticeHours: this.noticeHours,
        },
        recipients,
        dedupeKey: key,
      });
      return "NOTIFIED" as const;
    });
  }
}
