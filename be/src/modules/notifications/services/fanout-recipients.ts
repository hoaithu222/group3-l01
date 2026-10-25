import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import {
  KIND_BY_REASON,
  REASON_RANK,
  buildScopeKey,
  type FanoutReason,
} from "../entities/message-notification.types";
import type { FanoutMessage, RecipientUpsertResult } from "../repositories/fanout.repository.interface";
import { isFollowingReason, type AttentionRowSpec, type FanoutDeps } from "./fanout.types";

/** `dedupeKey` MỘT mục/người/tin (NT-01, TH-06) — cả `Notification` gốc lẫn `NotificationRecipient`. */
export function messageDedupeKey(messageId: string): string {
  return `msg:${messageId}`;
}

/** Hàng hộp thư theo lý do: MENTION → bucket `mentions`; FIRST_REPLY/THREAD_REPLY → `following`. */
export function attentionRowFor(reason: FanoutReason): AttentionRowSpec {
  return {
    kind: KIND_BY_REASON[reason],
    kindRank: REASON_RANK[reason],
    filterBucket: isFollowingReason(reason) ? "following" : "mentions",
  };
}

/** `streamKey` = luồng chứa tin: `"root"` hoặc threadId (khớp `mark-read-by-stream`). */
export function streamKeyOf(msg: FanoutMessage): string {
  return msg.threadId ?? "root";
}

/**
 * Ghi mục hộp thư cho các người nhận có lý do chú ý rồi phát `notification:created` tới `user:{id}` — chỉ cho
 * mục MỚI hoặc được NÂNG `kind` (NT-01: job chạy lại không phát trùng). Trả `Map userId → kết quả upsert`.
 */
export async function writeAttentionRows(
  deps: FanoutDeps,
  msg: FanoutMessage,
  notificationId: string,
  workspaceId: string | null,
  entries: { userId: string; reason: FanoutReason }[]
): Promise<Map<string, RecipientUpsertResult>> {
  const out = new Map<string, RecipientUpsertResult>();
  if (entries.length === 0) return out;

  const results = await deps.repo.upsertRecipients({
    notificationId,
    dedupeKey: messageDedupeKey(msg.id),
    scopeType: msg.scopeType,
    scopeId: msg.scopeId,
    workspaceId,
    streamKey: streamKeyOf(msg),
    streamSeq: msg.seq,
    rows: entries.map((e) => ({ userId: e.userId, ...attentionRowFor(e.reason) })),
  });
  const reasonByUser = new Map(entries.map((e) => [e.userId, e.reason]));
  const createdAt = (deps.now ? deps.now() : new Date()).toISOString();

  const touched: string[] = [];
  for (const r of results) {
    out.set(r.userId, r);
    if (!r.created && !r.upgraded) continue;
    touched.push(r.userId);
    const reason = reasonByUser.get(r.userId) as FanoutReason;
    try {
      deps.emitToUsers([r.userId], SocketEvent.NOTIFICATION_CREATED, {
        id: r.recipientRowId,
        kind: KIND_BY_REASON[reason],
        workspaceId,
        scopeType: msg.scopeType,
        scopeId: msg.scopeId,
        threadId: msg.threadId,
        messageId: msg.id,
        createdAt,
      });
    } catch {
      // Lỗi phát (worker đi qua cầu nối Redis p0-03; chưa có đường nào tới Socket.IO chỉ ở script/test) — mục hộp thư đã ghi, client sẽ thấy khi refetch.
    }
  }
  if (touched.length > 0) {
    deps.record.inboxCreated(touched.length);
    await deps.invalidateSummary(touched);
  }
  return out;
}

export function scopeKeyOf(msg: FanoutMessage): string {
  return buildScopeKey(msg.scopeType, msg.scopeId, msg.threadId);
}
