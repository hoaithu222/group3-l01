import { LIMITS } from "../../../core/constants/limits";
import type { IPushSender } from "../../../infrastructure/push";
import { logger } from "../../../infrastructure/logger";
import {
  PUSH_TYPE_BY_REASON,
  buildScopeKey,
  type CoalescedPushJobData,
  type FanoutReason,
  type MessagePushJobData,
  type MessageScopeType,
  type PushSkipReason,
} from "../entities/message-notification.types";
import type { FanoutMessage, IFanoutRepository } from "../repositories/fanout.repository.interface";
import { buildMessagePushPayload, effectiveLevel } from "./message-push-payload.builder";
import { renderMessagePreview } from "./message-preview";
import { decidePush } from "./push-decision";
import type { PendingInfo } from "./push-dispatch.service";
import type { MessagePreferenceResolver } from "./preference-resolver.service";

export type PushOutcome = { status: "SENT" | "FAILED"; tokens: number } | { status: "SKIPPED"; reason: PushSkipReason };

/** Phụ thuộc ngoài (quyền, token, FCM, đếm badge, Redis) — inject để test đơn vị không cần hạ tầng thật. */
export interface MessagePushDeps {
  repo: IFanoutRepository;
  prefs: MessagePreferenceResolver;
  pushEnabled(): Promise<boolean>;
  canReadScope(userId: string, scopeType: MessageScopeType, scopeId: string): Promise<boolean>;
  /** `true` nếu `userId` đã chặn `authorId` (NT-14). */
  hasBlockedAuthor(userId: string, authorId: string): Promise<boolean>;
  isViewing(userId: string, scopeKey: string): Promise<boolean>;
  getFcmTokens(userId: string): Promise<string[]>;
  revokeTokens(tokens: string[]): Promise<void>;
  sender(): IPushSender;
  /** `UnreadService.summary(u, {fresh:true}).badgeTotal` — số tại thời điểm gửi. */
  badgeFor(userId: string): Promise<number>;
  /** Đánh dấu đã push tin này cho người này (TTL dài) — `fanout.message-edit` dùng để không báo trùng. */
  markPushed(messageId: string, userId: string): Promise<void>;
  /** GETDEL bộ đếm chờ của cửa sổ gộp (`push:pending:*`, `push:pending-last:*`). */
  takePending(userId: string, scopeKey: string): Promise<{ count: number; last: PendingInfo | null }>;
  record: {
    sent(type: string, status: "sent" | "failed"): void;
    suppressed(reason: PushSkipReason): void;
  };
  now?: () => Date;
}

const MESSAGE_DEDUPE_PREFIX = "msg:";

interface DeliverArgs {
  userId: string;
  scopeType: MessageScopeType;
  scopeId: string;
  threadId: string | null;
  scopeKey: string;
  messageId: string;
  reason: FanoutReason;
  batchCount?: number;
}

/**
 * Xử lý `push.send` / `push.send-coalesced` cho TIN NHẮN (be.md §5.6): kiểm lại NGAY TRƯỚC KHI GỬI
 * (quyền đọc, còn chưa đọc, tin chưa thu hồi, mute/DND/chặn/đang xem, còn token) — NT-04/05/09/14 — rồi dựng
 * payload theo `lockScreenPreview` + `badge`, gửi FCM, dọn token chết, ghi kết quả lên mục hộp thư (nếu có).
 */
export class MessagePushService {
  constructor(private readonly deps: MessagePushDeps) {}

  async sendMessage(job: MessagePushJobData): Promise<PushOutcome> {
    return this.deliver({
      userId: job.userId,
      scopeType: job.scopeType,
      scopeId: job.scopeId,
      threadId: job.threadId,
      scopeKey: job.scopeKey,
      messageId: job.messageId,
      reason: job.reason,
    });
  }

  /** Cuối cửa sổ gộp: đọc-xoá bộ đếm; 0 tin chờ → bỏ; tin mới nhất làm `messageId` để app mở đúng chỗ. */
  async sendCoalesced(job: CoalescedPushJobData): Promise<PushOutcome | "empty"> {
    const { count, last } = await this.deps.takePending(job.userId, job.scopeKey);
    if (count <= 0 || !last) return "empty";
    return this.deliver({
      userId: job.userId,
      scopeType: job.scopeType,
      scopeId: job.scopeId,
      threadId: job.threadId,
      scopeKey: job.scopeKey,
      messageId: last.messageId,
      reason: last.reason,
      batchCount: count,
    });
  }

  private async deliver(a: DeliverArgs): Promise<PushOutcome> {
    const { repo } = this.deps;
    const skip = async (reason: PushSkipReason, message?: FanoutMessage | null): Promise<PushOutcome> => {
      this.deps.record.suppressed(reason);
      if (message && a.reason !== "MESSAGE") {
        await repo.setPushOutcome(`${MESSAGE_DEDUPE_PREFIX}${message.id}`, a.userId, {
          status: "SKIPPED",
          skipReason: reason.toUpperCase().replace("-", "_"),
        });
      }
      return { status: "SKIPPED", reason };
    };

    if (!(await this.deps.pushEnabled())) return skip("disabled");

    const message = await repo.findMessage(a.messageId);
    if (!message) return skip("recalled");
    if (message.deletedAt) return skip("recalled", message);

    if (!(await this.deps.canReadScope(a.userId, a.scopeType, a.scopeId))) {
      const rows = await repo.findRecipientRows(`${MESSAGE_DEDUPE_PREFIX}${message.id}`, [a.userId]);
      await repo.cancelRecipients(rows.map((r) => r.id), this.now());
      return skip("revoked");
    }

    const lastRead = await repo.getLastReadSeq(a.userId, a.scopeType, a.scopeId, a.threadId);
    if (lastRead >= message.seq) return skip("read", message);

    const meta = await repo.loadScopeMeta(a.scopeType, a.scopeId);
    if (!meta) return skip("revoked");
    const pref = await this.deps.prefs.resolveOne(
      { scopeType: a.scopeType, scopeId: a.scopeId, workspaceId: meta.workspaceId, conversationKind: meta.conversationKind },
      a.userId
    );
    const decision = decidePush({
      pushEnabled: true,
      pref,
      reason: a.reason,
      blocked: message.authorId ? await this.deps.hasBlockedAuthor(a.userId, message.authorId) : false,
      viewing: await this.deps.isViewing(a.userId, a.scopeKey),
    });
    if (!decision.send) return skip(decision.reason, message);

    const tokens = await this.deps.getFcmTokens(a.userId);
    if (tokens.length === 0) return skip("no-token", message);

    const level = effectiveLevel(pref.lockScreenPreview, meta.restricted);
    const senderName = message.authorId ? ((await repo.loadUserNames([message.authorId])).get(message.authorId) ?? null) : null;
    const payload = buildMessagePushPayload({
      userId: a.userId,
      messageId: message.id,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
      threadId: a.threadId,
      scopeKey: buildScopeKey(a.scopeType, a.scopeId, a.threadId),
      reason: a.reason,
      workspaceId: meta.workspaceId,
      conversationKind: meta.conversationKind,
      scopeName: meta.name,
      senderName,
      preview: level === "FULL" ? renderMessagePreview(message, LIMITS.notification.previewMaxChars) : "",
      level: pref.lockScreenPreview,
      restricted: meta.restricted,
      batchCount: a.batchCount,
      badge: await this.deps.badgeFor(a.userId),
      sound: pref.sound,
      now: this.now(),
    });

    const result = await this.deps.sender().sendMulticast(tokens, payload);
    if (result.invalidTokens.length > 0) await this.deps.revokeTokens(result.invalidTokens);

    const type = PUSH_TYPE_BY_REASON[a.reason];
    const ok = result.successCount > 0;
    this.deps.record.sent(type, ok ? "sent" : "failed");
    if (ok) await this.deps.markPushed(message.id, a.userId);
    if (a.reason !== "MESSAGE") {
      await repo.setPushOutcome(`${MESSAGE_DEDUPE_PREFIX}${message.id}`, a.userId, {
        status: ok ? "SENT" : "FAILED",
        deliveredPushAt: ok ? this.now() : undefined,
      });
    }
    if (!ok) logger.warn("[message-push] FCM không gửi được tới token nào", { userId: a.userId, messageId: message.id });
    return { status: ok ? "SENT" : "FAILED", tokens: tokens.length };
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
