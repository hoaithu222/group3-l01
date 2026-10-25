import type { Prisma } from "@prisma/client";
import { outbox } from "../../../infrastructure/queue";

export const GUEST_EXPIRE_JOB = "guest.expire";
export const GUEST_NOTICE_JOB = "guest.expiring-notice";

/** `guest.expire:membership:<id>:v<expiryVersion>` — relay outbox tự đổi `:` → `_` khi dùng làm `jobId` BullMQ. */
export function guestExpireKey(membershipId: string, version: number): string {
  return `${GUEST_EXPIRE_JOB}:membership:${membershipId}:v${version}`;
}

export function guestNoticeKey(membershipId: string, version: number): string {
  return `${GUEST_NOTICE_JOB}:membership:${membershipId}:v${version}`;
}

export interface GuestExpiryScheduleInput {
  membershipId: string;
  workspaceId: string;
  userId: string;
  expiresAt: Date;
  expiryVersion: number;
  noticeHours: number;
  now: Date;
}

/**
 * Lên lịch hết hạn khách BỀN trong transaction của caller (accept / gia hạn): hai dòng outbox có `availableAt` trong
 * tương lai — relay chỉ đẩy vào BullMQ khi tới hạn (không phụ thuộc Redis giữ job delayed, và `OutboxEvent.delayMs` là Int32
 * nên không đủ cho 90 ngày). Cron `guests.expire-sweep` (mỗi 15 phút) quét bù nếu relay/Redis lỡ nhịp.
 * Processor luôn kiểm lại `expiryVersion`/`expiresAt` nên dòng của phiên bản cũ (sau gia hạn) chạy cũng vô hại.
 */
export async function scheduleGuestExpiryInTx(tx: Prisma.TransactionClient, input: GuestExpiryScheduleInput): Promise<void> {
  const payload = {
    membershipId: input.membershipId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    expiryVersion: input.expiryVersion,
  };
  await outbox.add(tx, {
    type: "guest.expire.schedule",
    aggregateType: "WorkspaceMembership",
    aggregateId: input.membershipId,
    queue: "cron",
    jobName: GUEST_EXPIRE_JOB,
    dedupeKey: guestExpireKey(input.membershipId, input.expiryVersion),
    payload,
    availableAt: input.expiresAt,
  });
  const noticeAt = new Date(input.expiresAt.getTime() - input.noticeHours * 3600_000);
  if (noticeAt > input.now) {
    await outbox.add(tx, {
      type: "guest.expiring-notice.schedule",
      aggregateType: "WorkspaceMembership",
      aggregateId: input.membershipId,
      queue: "notifications",
      jobName: GUEST_NOTICE_JOB,
      dedupeKey: guestNoticeKey(input.membershipId, input.expiryVersion),
      payload,
      availableAt: noticeAt,
    });
  }
}

/** Gia hạn/đổi hạn: xoá các dòng outbox của phiên bản CŨ nếu chưa dispatch (dòng đã dispatch tự no-op nhờ kiểm version). */
export async function cancelGuestExpiryInTx(tx: Prisma.TransactionClient, membershipId: string, version: number): Promise<void> {
  await tx.outboxEvent.deleteMany({
    where: { dedupeKey: { in: [guestExpireKey(membershipId, version), guestNoticeKey(membershipId, version)] }, status: "PENDING" },
  });
}
