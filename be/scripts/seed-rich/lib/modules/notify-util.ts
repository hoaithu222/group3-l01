import type { Prisma } from "@prisma/client";
import { prisma } from "../core";

export interface InboxEntry {
  userId: string;
  /** `null` = chưa đọc. */
  readAt: Date | null;
}

export interface InboxNotification {
  type: string;
  scopeType: "NONE" | "WORKSPACE" | "CHANNEL" | "CONVERSATION";
  scopeId?: string;
  workspaceId: string | null;
  actorId: string | null;
  sourceType: string;
  sourceId: string;
  refs: Prisma.InputJsonObject;
  /** Khoá chống trùng của `Notification`; cũng là khoá của từng người nhận (như `notify()` của BE: `dedupeKey` người nhận = `sourceId`). */
  dedupeKey: string;
  createdAt: Date;
  recipients: readonly InboxEntry[];
  kind?: string;
  /** Mặc định `sourceId`. */
  recipientDedupeKey?: string;
}

/**
 * Ghi MỘT thông báo vào hộp thư của những người nhận — cùng bộ trường mà `notify()` (BE) ghi, nhưng KHÔNG xếp outbox/push:
 * `pushStatus: SKIPPED`, `skipReason: NO_DEVICE`. Idempotent theo `Notification.dedupeKey`. Trả id thông báo và `created` (true khi vừa tạo mới).
 */
export async function insertNotification(n: InboxNotification): Promise<{ id: string | null; created: boolean }> {
  const existing = await prisma.notification.findUnique({ where: { dedupeKey: n.dedupeKey }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  if (n.recipients.length === 0) return { id: null, created: false };
  const recipientDedupeKey = n.recipientDedupeKey ?? n.sourceId;
  const row = await prisma.notification.create({
    data: {
      type: n.type,
      scopeType: n.scopeType,
      ...(n.scopeId ? { scopeId: n.scopeId } : {}),
      workspaceId: n.workspaceId,
      actorId: n.actorId,
      sourceType: n.sourceType,
      sourceId: n.sourceId,
      refs: n.refs,
      dedupeKey: n.dedupeKey,
      createdAt: n.createdAt,
      recipients: {
        create: n.recipients.map((r) => ({
          recipientId: r.userId,
          kind: n.kind ?? "DEFAULT",
          inInbox: true,
          dedupeKey: recipientDedupeKey,
          scopeType: n.scopeType,
          ...(n.scopeId ? { scopeId: n.scopeId } : {}),
          workspaceId: n.workspaceId,
          readAt: r.readAt,
          seenAt: null,
          pushStatus: "SKIPPED" as const,
          skipReason: "NO_DEVICE",
          deliveredPushAt: null,
          createdAt: new Date(n.createdAt.getTime() + 500),
          kindRank: 0,
          streamKey: null,
          streamSeq: null,
          filterBucket: "all",
          cancelledAt: null,
        })),
      },
    },
  });
  return { id: row.id, created: true };
}
