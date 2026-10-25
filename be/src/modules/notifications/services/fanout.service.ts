import {
  isAttentionReason,
  type FanoutReason,
  type FanoutScopeContext,
  type PushTarget,
} from "../entities/message-notification.types";
import { reasonFor, type ReasonSets } from "./fanout-reasons";
import { messageDedupeKey, scopeKeyOf, writeAttentionRows } from "./fanout-recipients";
import { NOTIFYING_SYSTEM_TYPES, type FanoutDeps, type FanoutInput, type FanoutStats } from "./fanout.types";
import { decidePush, needsViewingCheck } from "./push-decision";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * `FanoutService.fanoutMessage` (p1-07 be.md §5.4) — 1 job/tin: audience → lý do từng người
 * (MENTION > FIRST_REPLY > THREAD_REPLY > MESSAGE) → mục hộp thư cho lý do cần chú ý (upsert theo
 * `msg:<messageId>`, NT-01) + `notification:created` → quyết định push từng người (be.md §5.5) → hàng đợi push.
 * Xử lý theo lô `fanoutChunkSize` (500) với cài đặt nạp HÀNG LOẠT để nhóm 200 người xong ≤ 3 s (NT-16).
 * Idempotent: chạy lại không tạo trùng mục hộp thư/push (unique recipient + khoá dedupe ở dispatch).
 */
export class FanoutService {
  constructor(private readonly deps: FanoutDeps) {}

  async fanoutMessage(input: FanoutInput): Promise<FanoutStats> {
    const startedAt = Date.now();
    const stats: FanoutStats = { audience: 0, attention: 0, pushEnqueued: 0, suppressed: {} };
    const { deps } = this;

    const msg = await deps.repo.findMessage(input.messageId);
    if (!msg) return { ...stats, skipped: "not-found" };
    if (msg.deletedAt) return { ...stats, skipped: "deleted" };
    if (msg.kind === "SYSTEM" && !NOTIFYING_SYSTEM_TYPES.has(msg.systemType ?? "")) return { ...stats, skipped: "system" };

    const readers = await deps.readers(msg.scopeType, msg.scopeId);
    const audience = [...new Set(readers)].filter((id) => id !== msg.authorId);
    stats.audience = audience.length;
    if (audience.length === 0) return { ...stats, skipped: "no-audience" };
    const inAudience = new Set(audience);

    const mentionIds =
      input.mentionUserIds ?? msg.mentions.filter((m) => m.type === "USER" && m.targetId).map((m) => m.targetId as string);
    const subscribers = msg.threadId ? await deps.threadSubscribers(msg.threadId) : [];
    const sets: ReasonSets = {
      mentionUserIds: new Set(mentionIds.filter((id) => inAudience.has(id))),
      mentionAll: input.mentionAll ?? msg.mentions.some((m) => m.type === "ALL"),
      threadSubscriberIds: new Set(subscribers.filter((id) => inAudience.has(id))),
      firstReplyUserId:
        input.isFirstReply && input.parentAuthorId && inAudience.has(input.parentAuthorId) ? input.parentAuthorId : null,
    };

    const meta = await deps.repo.loadScopeMeta(msg.scopeType, msg.scopeId);
    const ctx: FanoutScopeContext = {
      scopeType: msg.scopeType,
      scopeId: msg.scopeId,
      workspaceId: meta?.workspaceId ?? msg.workspaceId,
      conversationKind: meta?.conversationKind,
    };
    const scopeKey = scopeKeyOf(msg);
    const pushEnabled = await deps.pushEnabled();

    const reasons = new Map<string, FanoutReason>(audience.map((u) => [u, reasonFor(u, sets)]));
    const hasMention = [...reasons.values()].includes("MENTION");
    const hasAttention = [...reasons.values()].some(isAttentionReason);
    const notificationId = hasAttention
      ? await deps.repo.upsertMessageNotification({
          dedupeKey: messageDedupeKey(msg.id),
          type: hasMention ? "mention" : "thread.reply",
          scopeType: msg.scopeType,
          scopeId: msg.scopeId,
          workspaceId: ctx.workspaceId,
          actorId: msg.authorId,
          messageId: msg.id,
          threadId: msg.threadId,
          seq: msg.seq,
        })
      : null;

    for (const users of chunk(audience, deps.chunkSize)) {
      const blockers = msg.authorId ? await deps.blockersOf(msg.authorId, users) : new Set<string>();

      // Mục hộp thư — người đã chặn tác giả KHÔNG nhận (p1-08: mention từ người bị chặn không tạo thông báo).
      const attention = users
        .filter((u) => isAttentionReason(reasons.get(u) as FanoutReason) && !blockers.has(u))
        .map((u) => ({ userId: u, reason: reasons.get(u) as FanoutReason }));
      if (notificationId) await writeAttentionRows(deps, msg, notificationId, ctx.workspaceId, attention);
      stats.attention += attention.length;

      const prefs = await deps.prefs.resolveMany(ctx, users);
      const inputs = users.map((userId) => {
        const reason = reasons.get(userId) as FanoutReason;
        return { userId, reason, base: { pushEnabled, pref: prefs.get(userId)!, reason, blocked: blockers.has(userId) } };
      });

      const viewingCandidates = inputs.filter((i) => needsViewingCheck(i.base));
      const viewing = new Set<string>();
      await Promise.all(
        viewingCandidates.map(async (i) => {
          if (await deps.isViewing(i.userId, scopeKey)) viewing.add(i.userId);
        })
      );

      const targets: PushTarget[] = [];
      for (const i of inputs) {
        const decision = decidePush({ ...i.base, viewing: viewing.has(i.userId) });
        if (decision.send) {
          targets.push({
            userId: i.userId,
            messageId: msg.id,
            scopeType: msg.scopeType,
            scopeId: msg.scopeId,
            threadId: msg.threadId,
            scopeKey,
            reason: i.reason,
            seq: msg.seq,
            authorId: msg.authorId as string,
          });
          continue;
        }
        stats.suppressed[decision.reason] = (stats.suppressed[decision.reason] ?? 0) + 1;
        deps.record.suppressed(decision.reason);
        if (isAttentionReason(i.reason) && !blockers.has(i.userId)) {
          await deps.repo.setPushOutcome(messageDedupeKey(msg.id), i.userId, {
            status: "SKIPPED",
            skipReason: decision.reason.toUpperCase().replace("-", "_"),
          });
        }
      }
      if (targets.length > 0) await deps.dispatch.enqueueMany(targets);
      stats.pushEnqueued += targets.length;
    }

    deps.record.fanoutSeconds((Date.now() - startedAt) / 1000);
    return stats;
  }
}
