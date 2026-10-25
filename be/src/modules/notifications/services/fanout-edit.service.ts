import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { FanoutScopeContext, PushTarget } from "../entities/message-notification.types";
import { messageDedupeKey, scopeKeyOf, writeAttentionRows } from "./fanout-recipients";
import type { FanoutDeps, FanoutEditInput } from "./fanout.types";
import { decidePush, needsViewingCheck } from "./push-decision";

export interface FanoutEditStats {
  skipped?: "not-found" | "deleted" | "no-change";
  added: number;
  pushEnqueued: number;
  cancelled: number;
}

/**
 * `fanout.message-edit` (be.md §5.4 cuối) — sửa tin đổi tập nhắc tên:
 *  • `addedUserIds` (hoặc `allAdded`) → mục MENTION mới (+ push nếu người đó CHƯA từng nhận push của tin này);
 *  • `removedUserIds` (hoặc `allRemoved`) → mục MENTION CHƯA đọc bị huỷ (`inInbox=false`, `cancelledAt`) và phát
 *    `notification:read { ids }` để client gỡ; người vẫn theo dõi thread giữ nguyên mục (không còn lý do mention,
 *    nhưng vẫn là phản hồi trong luồng họ theo dõi).
 */
export class FanoutEditService {
  constructor(private readonly deps: FanoutDeps) {}

  async fanoutMessageEdit(input: FanoutEditInput): Promise<FanoutEditStats> {
    const { deps } = this;
    const stats: FanoutEditStats = { added: 0, pushEnqueued: 0, cancelled: 0 };
    const msg = await deps.repo.findMessage(input.messageId);
    if (!msg) return { ...stats, skipped: "not-found" };
    if (msg.deletedAt) return { ...stats, skipped: "deleted" };
    if (msg.kind !== "USER") return { ...stats, skipped: "no-change" };

    const readers = await deps.readers(msg.scopeType, msg.scopeId);
    const audience = new Set(readers.filter((id) => id !== msg.authorId));
    const dedupeKey = messageDedupeKey(msg.id);

    // ── Người bị gỡ nhắc tên ──
    const existing = input.allRemoved
      ? await deps.repo.listRecipientRows(dedupeKey)
      : await deps.repo.findRecipientRows(dedupeKey, input.removedUserIds);
    const subscribers = msg.threadId ? new Set(await deps.threadSubscribers(msg.threadId)) : new Set<string>();
    const cancel = existing.filter((r) => r.kind === "MENTION" && r.readAt === null && r.inInbox && !subscribers.has(r.userId));
    if (cancel.length > 0) {
      await deps.repo.cancelRecipients(cancel.map((r) => r.id), deps.now ? deps.now() : new Date());
      for (const r of cancel) {
        try {
          deps.emitToUsers([r.userId], SocketEvent.NOTIFICATION_READ, { ids: [r.id] });
        } catch {
          // best-effort
        }
      }
      await deps.invalidateSummary(cancel.map((r) => r.userId));
      stats.cancelled = cancel.length;
    }

    // ── Người mới được nhắc tên ──
    const addedIds = input.allAdded ? [...audience] : input.addedUserIds.filter((id) => audience.has(id));
    if (addedIds.length === 0) return stats;

    const meta = await deps.repo.loadScopeMeta(msg.scopeType, msg.scopeId);
    const ctx: FanoutScopeContext = {
      scopeType: msg.scopeType,
      scopeId: msg.scopeId,
      workspaceId: meta?.workspaceId ?? msg.workspaceId,
      conversationKind: meta?.conversationKind,
    };
    const blockers = msg.authorId ? await deps.blockersOf(msg.authorId, addedIds) : new Set<string>();
    const recipients = addedIds.filter((u) => !blockers.has(u));
    if (recipients.length === 0) return stats;

    const notificationId = await deps.repo.upsertMessageNotification({
      dedupeKey,
      type: "mention",
      scopeType: msg.scopeType,
      scopeId: msg.scopeId,
      workspaceId: ctx.workspaceId,
      actorId: msg.authorId,
      messageId: msg.id,
      threadId: msg.threadId,
      seq: msg.seq,
    });
    await writeAttentionRows(deps, msg, notificationId, ctx.workspaceId, recipients.map((userId) => ({ userId, reason: "MENTION" as const })));
    stats.added = recipients.length;

    // Push chỉ cho người CHƯA nhận push của tin này (đã nhận khi gửi lần đầu → không báo trùng).
    const pushEnabled = await deps.pushEnabled();
    const prefs = await deps.prefs.resolveMany(ctx, recipients);
    const scopeKey = scopeKeyOf(msg);
    const targets: PushTarget[] = [];
    for (const userId of recipients) {
      if (await deps.wasPushed(msg.id, userId)) continue;
      const base = { pushEnabled, pref: prefs.get(userId)!, reason: "MENTION" as const, blocked: false };
      const viewing = needsViewingCheck(base) ? await deps.isViewing(userId, scopeKey) : false;
      const decision = decidePush({ ...base, viewing });
      if (!decision.send) {
        deps.record.suppressed(decision.reason);
        await deps.repo.setPushOutcome(dedupeKey, userId, { status: "SKIPPED", skipReason: decision.reason.toUpperCase().replace("-", "_") });
        continue;
      }
      targets.push({
        userId,
        messageId: msg.id,
        scopeType: msg.scopeType,
        scopeId: msg.scopeId,
        threadId: msg.threadId,
        scopeKey,
        reason: "MENTION",
        seq: msg.seq,
        authorId: msg.authorId as string,
      });
    }
    if (targets.length > 0) await deps.dispatch.enqueueMany(targets);
    stats.pushEnqueued = targets.length;
    return stats;
  }
}
