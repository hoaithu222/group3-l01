import { redis } from "../../../infrastructure/redis";
import { getIO } from "../../../infrastructure/socket";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { enqueue, scheduleAt, toSafeJobId } from "../../../infrastructure/queue";
import { permissionService, type ScopeType } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { isViewing as isViewingScope } from "../../../infrastructure/socket/socket.viewing";
import { getNotificationType } from "./notification-types";
import { PreferenceResolver, isInDnd } from "./preference.resolver";
import type { EffectiveMessagePreference } from "./preference-matrix";
import type { INotificationRepository } from "../repositories/notification.repository.interface";
import type { NotifyScopeInput, NotificationTypeDef } from "../entities/notification.interface";
import type { FanoutScopeContext, MessageScopeType } from "../entities/message-notification.types";

export interface DevicePort {
  hasActiveDevice(userId: string): Promise<boolean>;
}

/**
 * Cài đặt HIỆU LỰC cho loại thông báo gắn với luồng CHAT (scope CHANNEL/CONVERSATION — vd `mention.role`, loại mới của
 * module khác): dùng đúng ma trận p1-07 như push tin nhắn (`ChannelMembership/ConversationMember.notifyMode` +
 * `mutedUntil` > workspace > tài khoản > mặc định) để MUTED/mention-only nhất quán giữa mọi loại (NT-04).
 */
export interface ChatScopePreferencePort {
  loadScopeMeta(
    scopeType: MessageScopeType,
    scopeId: string
  ): Promise<{ workspaceId: string | null; conversationKind?: "DIRECT" | "GROUP" } | null>;
  resolveOne(scope: FanoutScopeContext, userId: string): Promise<EffectiveMessagePreference>;
}

export interface DeliveryPolicyOptions {
  chatPrefs?: ChatScopePreferencePort;
  /** "Đang xem" theo khoá Redis `viewing:<u>:<scopeKey>` (worker không có `getIO()`); mặc định `socket.viewing.isViewing`. */
  isViewing?: (userId: string, scopeKey: string) => Promise<boolean>;
}

const isChatScope = (t: string): t is MessageScopeType => t === "CHANNEL" || t === "CONVERSATION";

/** be.md §5.4 bước 4 "MENTIONS ... hoặc loại cá nhân" — `calls`/`meetings` là thông báo gửi thẳng tới cá nhân, không phải hoạt động kênh nên KHÔNG bị lọc bởi ALL/MENTIONS (chỉ MUTED mới chặn được, qua `respectMute`). */
const PERSONAL_INBOX_FILTERS = new Set(["calls", "meetings"]);

// Phase 3 (foundation): `@role` và mention trong bình luận thẻ cũng là "được nhắc tên" → không bị lọc bởi chế độ MENTIONS.
const MENTION_KINDS = new Set(["MENTION", "FIRST_REPLY", "THREAD_REPLY", "MENTION_ROLE", "TASK_COMMENT_MENTION"]);

/**
 * Chế độ "chỉ nhắc tên" (`MENTIONS`/`MENTIONS_AND_THREADS`) là cài đặt cho HOẠT ĐỘNG CHAT (tin trong kênh/hội thoại) — chỉ lọc loại
 * gắn với luồng chat, không cá nhân, không phải nhắc tên/theo dõi. Loại ở scope KHÁC (WORKSPACE, họp, gọi, không scope: giao việc, nhắc hạn,
 * lời mời, ví…) là chuyện đích danh người nhận nên KHÔNG bị lọc — trước đây mặc định `MENTIONS` âm thầm bỏ push của chúng (`MODE`).
 * Bình luận thẻ thường (`task.comment`) coi như trả lời trong luồng đang theo dõi (giao/tạo thẻ = theo dõi) nên cũng đi qua; MUTED/DND vẫn chặn.
 * Loại gắn luồng chat mà vẫn cá nhân: khai `personal: true` ở def.
 */
function isFilteredByMentionsMode(def: NotificationTypeDef, scope: NotifyScopeInput | null, kind: string): boolean {
  if (!scope || !isChatScope(scope.type)) return false;
  if (MENTION_KINDS.has(kind)) return false;
  return !(def.personal ?? PERSONAL_INBOX_FILTERS.has(def.inboxFilter));
}

const ROOM_BY_SCOPE_TYPE: Partial<Record<string, (id: string) => string>> = {
  WORKSPACE: ROOM.workspace,
  CHANNEL: ROOM.channel,
  CONVERSATION: ROOM.conversation,
  MEETING: ROOM.meeting,
  CALL: ROOM.call,
};

/**
 * `deliver.recipient` (be.md §5.4) — quyền → inbox socket → preference/DND →
 * đang xem scope → thiết bị → enqueue push. Mỗi bước "SKIPPED" ghi lại
 * `skipReason` để `GET /notifications` biết hiển thị nhãn (đã tắt tiếng…) và
 * để test/audit truy vết lý do không push.
 */
export class DeliveryPolicy {
  private readonly preferenceResolver: PreferenceResolver;

  constructor(
    private readonly repo: INotificationRepository,
    private readonly devices: DevicePort,
    private readonly options: DeliveryPolicyOptions = {}
  ) {
    this.preferenceResolver = new PreferenceResolver({
      get: (userId, scope, scopeKey) => repo.getPreference(userId, scope, scopeKey),
    });
  }

  async deliverRecipient(notificationId: string, recipientId: string): Promise<void> {
    const found = await this.repo.findRecipientWithNotification(notificationId, recipientId);
    if (!found) {
      logger.warn("[delivery.policy] Không tìm thấy recipient/notification, bỏ qua", {
        notificationId,
        recipientId,
      });
      return;
    }
    const { recipient, notification } = found;
    if (recipient.pushStatus === "SENT" || recipient.pushStatus === "SKIPPED") return;

    const def = getNotificationType(notification.type);
    if (!def) {
      logger.warn("[delivery.policy] Loại thông báo chưa đăng ký, bỏ qua", { type: notification.type });
      return;
    }

    const scope: NotifyScopeInput | null =
      notification.scopeType !== "NONE" && notification.scopeId
        ? { type: notification.scopeType as NotifyScopeInput["type"], id: notification.scopeId }
        : null;

    // 2. Quyền hiện tại (có thể đã bị thu hồi từ lúc notify() tới lúc deliver).
    if (def.readAction && scope) {
      const stubUser: AuthUser = { id: recipientId, email: "" };
      const allowed = await permissionService.can(stubUser, def.readAction, {
        type: scope.type as ScopeType,
        id: scope.id,
      });
      if (!allowed) {
        await this.skip(recipient.id, "REVOKED");
        return;
      }
    }

    // 3. Emit socket (inbox) — trước khi xét push, kể cả khi sau đó push bị SKIPPED.
    if (def.inbox) {
      emitToUsers([recipientId], SocketEvent.NOTIFICATION_CREATED, {
        // `id` = id MỤC HỘP THƯ của người nhận (= `GET /notifications` `items[].id`, `POST /notifications/:id/read`) — cùng
        // nghĩa với `notification:created` của fan-out tin nhắn; `notificationId` là id `Notification` gốc (tham chiếu).
        id: recipient.id,
        notificationId,
        type: notification.type,
        kind: recipient.kind,
        scopeType: notification.scopeType,
        scopeId: notification.scopeId,
        workspaceId: notification.workspaceId,
        refs: notification.refs,
        createdAt: recipient.createdAt.toISOString(),
      });
    }

    if (!def.pushType) return; // loại không push (chỉ inbox+socket) — xong.

    // 4. Preference nhiều scope + DND/quiet hours.
    const effective = await this.effectivePreference(recipientId, scope, notification.workspaceId ?? undefined);

    if (effective.mode === "MUTED" && def.respectMute !== "NEVER") {
      await this.skip(recipient.id, "MUTED");
      return;
    }
    if (effective.mode === "MENTIONS" && isFilteredByMentionsMode(def, scope, recipient.kind)) {
      await this.skip(recipient.id, "MODE");
      return;
    }
    if (!def.bypassDnd && effective.dnd) {
      await this.skip(recipient.id, "DND");
      return;
    }

    // 5. Đang xem đúng scope (room + presence active).
    if (scope && (await this.isViewing(recipientId, scope))) {
      await this.skip(recipient.id, "VIEWING");
      return;
    }

    // 6. Không có thiết bị hoạt động.
    if (!(await this.devices.hasActiveDevice(recipientId))) {
      await this.skip(recipient.id, "NO_DEVICE");
      return;
    }

    /**
     * 7. Đánh dấu PENDING — **TRƯỚC** khi xếp hàng, không phải sau.
     *
     * ⛔ Thứ tự cũ (enqueue rồi mới PENDING) là một RACE làm MẤT TRẮNG push cuộc gọi, đã đo trên
     * production 01/10/2026: mọi `NotificationRecipient` của `call.incoming` kẹt vĩnh viễn ở
     * `PENDING`, không bản ghi nào lên `SENT`, worker không log một dòng nào.
     *
     * Vì sao: `push.send` lọc `rows.filter(r => r.recipient.pushStatus === "PENDING")` rồi
     * `return` IM LẶNG khi rỗng (`push.jobs.ts`). Cuộc gọi là loại DUY NHẤT xếp job chạy NGAY
     * (không có cửa sổ gộp 10 s như các loại khác), nên worker thường nhặt job lên trước khi
     * dòng cập nhật ở bước sau kịp commit ⇒ job thấy `pushStatus` còn null và bỏ đi. Các loại
     * batchable không lộ lỗi vì chúng chờ hết cửa sổ gộp mới chạy.
     *
     * Ghi trước thì xấu nhất chỉ là một dòng PENDING mồ côi khi `enqueue` lỗi — đúng bằng hiện
     * trạng cũ, và không bao giờ nuốt mất một cuộc gọi.
     */
    await this.repo.updateRecipientDelivery(recipient.id, { pushStatus: "PENDING" });

    // 8. Xếp hàng push theo loại.
    await this.enqueuePush(def, notification, recipient, scope);
  }

  private async enqueuePush(
    def: NotificationTypeDef,
    notification: { refs: Record<string, unknown> | null },
    recipient: { id: string; recipientId: string },
    scope: NotifyScopeInput | null
  ): Promise<void> {
    if (def.pushType === "call.incoming") {
      const callId = String(notification.refs?.["callId"] ?? recipient.id);
      await enqueue("push", "push.voip", { recipientRowId: recipient.id }, { jobId: toSafeJobId(`push.voip:${callId}:${recipient.recipientId}`) });
      await enqueue("push", "push.send", { recipientRowIds: [recipient.id] }, { jobId: toSafeJobId(`push.send:${recipient.id}`) });
      return;
    }

    if (def.batchable) {
      // be.md §5.4 bước 7 — gộp theo (userId, scope), KHÔNG theo id bản ghi
      // (mỗi notification tạo 1 bản ghi mới — key theo `recipient.id` sẽ
      // không bao giờ gộp được gì).
      const scopeKey = scope ? `${scope.type}:${scope.id}` : "none";
      const batchKey = `push:batch:${recipient.recipientId}:${scopeKey}`;
      const windowSeconds = LIMITS.notification.pushBatchWindowSeconds;
      const windowStart = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds;
      try {
        await redis.lpush(batchKey, recipient.id);
      } catch (err) {
        logger.warn("[delivery.policy] Redis LPUSH lỗi — gửi push ngay thay vì gộp", {
          error: err instanceof Error ? err.message : String(err),
        });
        await enqueue("push", "push.send", { recipientRowIds: [recipient.id] }, { jobId: toSafeJobId(`push.send:${recipient.id}`) });
        return;
      }
      await scheduleAt(
        "push",
        "push.send",
        toSafeJobId(`push.send:${recipient.recipientId}:${scopeKey}:${windowStart}`),
        { batchKey },
        new Date((windowStart + windowSeconds) * 1000)
      );
      return;
    }

    await enqueue("push", "push.send", { recipientRowIds: [recipient.id] }, { jobId: toSafeJobId(`push.send:${recipient.id}`) });
  }

  /**
   * Chế độ + DND hiệu lực. Luồng chat (CHANNEL/CONVERSATION) đi qua ma trận p1-07; lựa chọn TƯỜNG MINH kiểu cũ
   * (`NotificationPreference` scope CHANNEL/CONVERSATION do `PUT /me/notification-preferences` có `scope`) vẫn thắng.
   * Scope khác (WORKSPACE/MEETING/CALL/không scope) giữ `PreferenceResolver` p0-06.
   */
  private async effectivePreference(
    userId: string,
    scope: NotifyScopeInput | null,
    workspaceId?: string
  ): Promise<{ mode: "ALL" | "MENTIONS" | "MUTED"; dnd: boolean }> {
    const port = this.options.chatPrefs;
    if (port && scope && isChatScope(scope.type)) {
      const meta = await port.loadScopeMeta(scope.type, scope.id);
      if (meta) {
        const pref = await port.resolveOne(
          { scopeType: scope.type, scopeId: scope.id, workspaceId: meta.workspaceId, conversationKind: meta.conversationKind },
          userId
        );
        let mode = pref.mode;
        const explicit = await this.repo.getPreference(userId, scope.type, scope.id);
        if (explicit && explicit.mode !== "INHERIT") {
          mode = explicit.mode === "MUTED" || (explicit.mutedUntil && explicit.mutedUntil.getTime() > Date.now()) ? "MUTED" : explicit.mode;
        }
        return { mode, dnd: pref.dnd };
      }
    }
    const legacy = await this.preferenceResolver.resolve(userId, scope, workspaceId);
    return { mode: legacy.mode, dnd: isInDnd(legacy) };
  }

  private async skip(recipientId: string, reason: string): Promise<void> {
    await this.repo.updateRecipientDelivery(recipientId, { pushStatus: "SKIPPED", skipReason: reason });
  }

  /**
   * "Đang xem" = có socket của user trong room scope VÀ `presence:active:{userId}`
   * còn hạn (be.md §5.4 bước 5). `getIO()` ném lỗi ở tiến trình worker thuần
   * (không chạy HTTP/Socket.IO) — coi như "không đang xem" (an toàn hơn: vẫn
   * gửi push thay vì lặng lẽ bỏ qua).
   */
  private async isViewing(userId: string, scope: NotifyScopeInput): Promise<boolean> {
    // Luồng chat: khoá Redis `viewing:*` (do socket `room:join`/heartbeat đặt) — worker riêng cũng đọc được.
    if (isChatScope(scope.type)) return (this.options.isViewing ?? isViewingScope)(userId, `${scope.type}:${scope.id}`);
    const room = ROOM_BY_SCOPE_TYPE[scope.type]?.(scope.id);
    if (!room) return false;
    try {
      const io = getIO();
      const sockets = await io.in(room).fetchSockets();
      const inRoom = sockets.some((s) => (s.data as { user?: AuthUser }).user?.id === userId);
      if (!inRoom) return false;
      const active = await redis.exists(`presence:active:${userId}`);
      return !!active;
    } catch {
      return false;
    }
  }
}
