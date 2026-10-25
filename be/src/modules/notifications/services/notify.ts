import type { Prisma } from "@prisma/client";
import { outbox } from "../../../infrastructure/queue";
import { getNotificationType } from "./notification-types";
import { getNotificationBlockFilter } from "./block-filter.holder";
import type { NotifyInput } from "../entities/notification.interface";

/** Ưu tiên hợp nhất `kind` khi trùng `(recipientId, dedupeKey)` (be.md §5.3 bước 2 "$max"). Số cao hơn thắng. */
const KIND_PRIORITY: Record<string, number> = {
  MENTION: 100,
  // Phase 3 (foundation): `TASK_COMMENT_MENTION` > `TASK_COMMENT` cho CÙNG `dedupeKey` nguồn (commentId, p3-03);
  // `MENTION_ROLE` ưu tiên DƯỚI MENTION cá nhân (p3-04 §2/§5.7, NT-01). Xem `core/constants/notification-types.ts`.
  TASK_COMMENT_MENTION: 100,
  MENTION_ROLE: 90,
  FIRST_REPLY: 80,
  THREAD_REPLY: 60,
  TASK_COMMENT: 10,
  DEFAULT: 0,
};

function priorityOf(kind: string): number {
  return KIND_PRIORITY[kind] ?? 0;
}

export interface NotifyResult {
  notificationId: string;
}

/**
 * `notify(tx, input)` (be.md §5.3) — ghi `Notification` + `NotificationRecipient`
 * + `Outbox(deliver.recipient)` TRONG CÙNG transaction do MODULE GỌI mở (giống
 * `AssetLinkService.attach(tx, ...)` — NGOẠI LỆ CÓ CHỦ ĐÍCH đi thẳng `tx.*`
 * thay vì qua `INotificationRepository`, vốn chỉ đọc qua singleton `prisma`
 * không nhận `tx`). Export qua `public.ts` — module Phase 1+ KHÔNG tự ghi
 * `Notification`/`NotificationRecipient`/gọi `getPushSender()` trực tiếp.
 *
 * IDEMPOTENT (p1-07): gọi lại với cùng `dedupeKey` + người nhận đã có mục KHÔNG ghi thêm dòng outbox
 * `deliver.recipient` (trước đây trùng khoá unique `deliver:<notificationId>:<userId>` → P2002 huỷ cả transaction của
 * caller, nên moderation/wallet/projects phải tự kiểm `Notification.dedupeKey` trước). Chỉ NGƯỜI NHẬN MỚI mới được xếp
 * giao; người đã có mục chỉ được nâng `kind` (theo `KIND_PRIORITY`).
 * `type.respectBlock` + `actorId` → người nhận đã chặn người gây ra bị bỏ khỏi danh sách trước khi ghi (BLOCK-03).
 */
export async function notify(tx: Prisma.TransactionClient, input: NotifyInput): Promise<NotifyResult> {
  const def = getNotificationType(input.type);
  if (!def) {
    throw new Error(`[notify] Loại thông báo chưa đăng ký: "${input.type}" — gọi registerNotificationType() trước`);
  }

  const scopeType = input.scope?.type ?? "NONE";
  const scopeId = input.scope?.id;

  let recipients = input.recipients.filter((r) => r.userId !== input.actorId);
  if (def.respectBlock && input.actorId && recipients.length > 0) {
    const allowed = new Set(
      await getNotificationBlockFilter().filterNotificationRecipients(input.actorId, recipients.map((r) => r.userId))
    );
    recipients = recipients.filter((r) => allowed.has(r.userId));
  }

  const notification = await tx.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      type: input.type,
      scopeType,
      scopeId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      sourceType: input.source.type,
      sourceId: input.source.id,
      refs: (input.refs ?? {}) as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey,
    },
  });

  for (const recipient of recipients) {
    const kind = recipient.kind ?? "DEFAULT";
    const recipientDedupeKey = input.source.id;

    const existing = await tx.notificationRecipient.findUnique({
      where: { recipientId_dedupeKey: { recipientId: recipient.userId, dedupeKey: recipientDedupeKey } },
    });

    if (existing) {
      if (priorityOf(kind) > priorityOf(existing.kind)) {
        await tx.notificationRecipient.update({ where: { id: existing.id }, data: { kind, kindRank: priorityOf(kind) } });
      }
      continue; // đã có mục (đã/đang được giao) — không xếp giao lần 2 (idempotent)
    }

    await tx.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        recipientId: recipient.userId,
        kind,
        inInbox: def.inbox,
        dedupeKey: recipientDedupeKey,
        scopeType,
        scopeId,
        workspaceId: input.workspaceId,
        // Ghi tường minh null (không để field "absent") — Prisma+Mongo coi
        // field CHƯA TỪNG set khác field set=null; các job/query sau lọc
        // theo `readAt: null`/`seenAt: null` (`markRead`/`unreadCount`) chỉ
        // khớp khi field đã được set tường minh (cùng đặc thù `assets`/`devices`).
        readAt: null,
        seenAt: null,
        skipReason: null,
        // p1-07 — `filterBucket` để lọc hộp thư theo người nhận (một Notification có thể có người nhận
        // với lý do khác nhau); các field còn lại ghi null tường minh (Prisma+Mongo không khớp "absent").
        filterBucket: def.inboxFilter,
        kindRank: priorityOf(kind),
        streamKey: input.stream?.key ?? null,
        streamSeq: input.stream?.seq ?? null,
        cancelledAt: null,
      },
    });

    await outbox.add(tx, {
      type: "notification.deliver",
      aggregateType: "NotificationRecipient",
      aggregateId: `${notification.id}:${recipient.userId}`,
      queue: "notifications",
      jobName: "deliver.recipient",
      dedupeKey: `deliver:${notification.id}:${recipient.userId}`,
      payload: { notificationId: notification.id, recipientId: recipient.userId },
    });
  }

  return { notificationId: notification.id };
}
