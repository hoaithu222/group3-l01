import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { permissionService } from "../../../core/permission";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type {
  Message,
  MessageActivityInfo,
  MessageCommittedInfo,
  MessageScope,
  MessageScopeReadAccess,
  MessageScopeViewerContext,
  MessageScopeWriteAccess,
  MentionValidationInput,
  MentionValidationResult,
} from "../../messages/public";
import { excerptOf } from "../../messages/public";
import { getBlockPort } from "../../blocks/public";
import { loadConversationMeta, listActiveMemberIds } from "../permission/conversation.scope-resolver";

/**
 * `MessageScope` CONVERSATION (item 10 "critical facts" của tác vụ p1-05) —
 * mirror `channel-message-scope.adapter.ts` (be.md p1-03 §5.6): uỷ quyền
 * đọc/ghi qua resolver CONVERSATION đã đăng ký (`registerConversationPermissionResolver`)
 * bằng `permissionService.resolve()` — KHÔNG tự tính lại rank/eligibility ở
 * đây (đã tính trong resolver, xem `conversation.scope-resolver.ts`).
 */
export class ConversationMessageScopeAdapter implements MessageScope {
  readonly scopeType = "CONVERSATION" as const;

  async canRead(user: AuthUser, scopeId: string): Promise<MessageScopeReadAccess> {
    const access = await permissionService.resolve(user, { type: "CONVERSATION", id: scopeId });
    if (!access.visible) return { visible: false, workspaceId: null };
    const meta = await loadConversationMeta(scopeId);
    return { visible: true, workspaceId: meta?.workspaceId ?? null };
  }

  async canWrite(user: AuthUser, scopeId: string): Promise<MessageScopeWriteAccess> {
    const access = await permissionService.resolve(user, { type: "CONVERSATION", id: scopeId });
    if (!access.visible) return { visible: false, allowed: false, workspaceId: null };
    const meta = await loadConversationMeta(scopeId);
    return { visible: true, allowed: access.actions.has("conversation.message.send"), workspaceId: meta?.workspaceId ?? null };
  }

  async viewerContext(user: AuthUser, scopeId: string): Promise<MessageScopeViewerContext> {
    const [access, member] = await Promise.all([
      permissionService.resolve(user, { type: "CONVERSATION", id: scopeId }),
      prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: scopeId, userId: user.id } },
        select: { hiddenBeforeSeq: true },
      }),
    ]);
    return {
      // "Xoá phía tôi" (D-23) — be.md §5.8/§3.4.
      hiddenBeforeSeq: member?.hiddenBeforeSeq ?? 0,
      capabilities: {
        canWrite: access.actions.has("conversation.message.send"),
        canReact: access.actions.has("conversation.message.send"),
        canPin: access.actions.has("conversation.message.pin"),
        canModerate: access.actions.has("conversation.member.remove"),
      },
    };
  }

  pinMax(): number {
    return LIMITS.conversation.pinMax;
  }

  async readerIds(scopeId: string): Promise<string[]> {
    return listActiveMemberIds(scopeId);
  }

  /**
   * be.md §5.7 `onMessageCreated` — cập nhật `Conversation` (lastSeq/lastMessageAt/
   * lastMessageId/activityAt) VÀ `ConversationMember` (activityAt, tự bỏ lưu
   * trữ trừ khi tắt tiếng, unreadCount/mentionsSinceRead cho người ≠ tác giả,
   * lastReadSeq=seq cho tác giả) TRONG CÙNG transaction gửi tin. `MessageCommittedInfo`
   * (interface THẬT — xem `message-scope.interface.ts`) không mang `authorId`/
   * `mentions` như be.md §5.7 pseudocode mô tả — đọc lại `tx.message` bằng
   * `info.messageId` NGAY TRONG transaction thay vì làm ở `emitActivity()`
   * (chạy sau commit, "at-least-once" qua job retry) để tránh double-count
   * `unreadCount`/`mentionsSinceRead` nếu job retry (mục 10 "critical facts").
   */
  async onMessageCommitted(tx: Prisma.TransactionClient, scopeId: string, info: MessageCommittedInfo): Promise<void> {
    const message =
      info.authorId !== undefined && info.mentions !== undefined
        ? { authorId: info.authorId, mentions: info.mentions }
        : await tx.message.findUnique({ where: { id: info.messageId }, select: { authorId: true, mentions: true } });
    const authorId = message?.authorId ?? null;
    const rawMentionedUserIds = Array.from(
      new Set(
        (message?.mentions ?? [])
          .filter((m) => m.type === "USER" && m.targetId)
          .map((m) => m.targetId as string)
      )
    );
    // p1-08/p1-07: người ĐÃ CHẶN tác giả không bị đếm nhắc tên (không có mục hộp thư/push mention từ người bị chặn —
    // `BlockPort.filterNotificationRecipients`, một hướng). Đọc ngoài transaction (cache Redis, fail-open về DB); lỗi
    // đọc chặn KHÔNG được làm hỏng việc gửi tin → rơi về danh sách chưa lọc.
    let mentionedUserIds = rawMentionedUserIds;
    if (authorId && rawMentionedUserIds.length > 0) {
      try {
        mentionedUserIds = await getBlockPort().filterNotificationRecipients(authorId, rawMentionedUserIds);
      } catch {
        mentionedUserIds = rawMentionedUserIds;
      }
    }

    await tx.conversation.updateMany({
      where: { id: scopeId, lastSeq: { lt: info.seq } },
      data: { lastSeq: info.seq, lastMessageAt: info.createdAt, lastMessageId: info.messageId, activityAt: info.createdAt },
    });

    const othersWhere: Prisma.ConversationMemberWhereInput = {
      conversationId: scopeId,
      status: "ACTIVE",
      ...(authorId ? { userId: { not: authorId } } : {}),
    };

    await tx.conversationMember.updateMany({
      where: othersWhere,
      data: { activityAt: info.createdAt, unreadCount: { increment: 1 } },
    });

    // Tự bỏ lưu trữ (D-10 README §2 "Hội thoại lưu trữ có tin mới") trừ khi
    // đang tắt tiếng (`notifyMode MUTED` hoặc `mutedUntil` còn hiệu lực).
    await tx.conversationMember.updateMany({
      where: {
        ...othersWhere,
        notifyMode: { not: "MUTED" },
        OR: [{ mutedUntil: null }, { mutedUntil: { lte: info.createdAt } }],
      },
      data: { archivedAt: null },
    });

    if (mentionedUserIds.length > 0) {
      await tx.conversationMember.updateMany({
        where: { conversationId: scopeId, status: "ACTIVE", userId: { in: mentionedUserIds } },
        data: { mentionsSinceRead: { increment: 1 } },
      });
    }

    if (authorId) {
      await tx.conversationMember.updateMany({
        where: { conversationId: scopeId, userId: authorId, status: "ACTIVE" },
        data: { lastReadSeq: info.seq, unreadCount: 0, activityAt: info.createdAt },
      });
    }
  }

  /**
   * be.md §6 — `conversation:activity` tới `user:{id}` mọi member ACTIVE, 2
   * lượt `emitToUsers` (mention/không mention) như CHANNEL. KHÔNG kèm
   * `unreadCount` (be.md: "tuỳ người" — client tự `+1`).
   *
   * Khác CHANNEL (không preview): FE (`conversation-socket-events.types.ts`) vá thẳng "tin mới nhất" của danh
   * sách hội thoại từ CHÍNH payload này (không gọi lại API), nên phải đủ tên field `seq`/`authorId`/`authorName`/
   * `createdAt`/`preview`/`attachmentKind` — trước đây phát nhầm `lastSeq`/`lastMessageAt` (tên CHANNEL) khiến FE
   * đọc `undefined`, hỏng lây cả preview lẫn suy luận "đã đọc" (dựa vào `lastMessage.seq`). `info` không sẵn
   * preview/tên tác giả nên đọc thêm 1 lần — chạy sau khi outbox đã claim (không nằm trong transaction gửi tin).
   */
  async emitActivity(scopeId: string, info: MessageActivityInfo): Promise<void> {
    const memberIds = await listActiveMemberIds(scopeId);
    if (memberIds.length === 0) return;

    const [meta, message, author] = await Promise.all([
      loadConversationMeta(scopeId),
      prisma.message.findUnique({ where: { id: info.messageId }, select: { content: true, attachments: true, systemType: true, systemPayload: true } }),
      info.authorId ? prisma.user.findUnique({ where: { id: info.authorId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    // `excerptOf` soạn sẵn cho đúng việc này (xem comment tại message-projection.ts) — chỉ đọc `content`/`attachments`
    // nên object truyền vào không cần đủ `Message`, cùng cách ép kiểu `buildLastMessagePreview` đang dùng.
    const preview = message ? excerptOf({ kind: info.kind, content: message.content, attachments: message.attachments } as unknown as Message, 120) : "";
    const attachmentKind = message && message.attachments.length > 0 ? message.attachments[0].kind : null;

    const mentionedIds = new Set(
      info.mentions.filter((m) => m.type === "USER" && m.targetId).map((m) => m.targetId as string)
    );
    const basePayload = {
      conversationId: scopeId,
      workspaceId: meta?.workspaceId ?? null,
      seq: info.seq,
      authorId: info.authorId,
      authorName: author?.name ?? null,
      createdAt: info.createdAt,
      preview,
      attachmentKind,
      // Tin hệ thống (vd tóm tắt cuộc gọi) không có chữ để excerpt — gửi kèm loại + payload để danh sách dựng câu theo góc nhìn từng người.
      ...(info.kind === "SYSTEM" && message ? { systemType: message.systemType, systemPayload: message.systemPayload } : {}),
    };
    const mentioned = memberIds.filter((id) => mentionedIds.has(id));
    const rest = memberIds.filter((id) => !mentionedIds.has(id));
    if (rest.length > 0) emitToUsers(rest, SocketEvent.CONVERSATION_ACTIVITY, { ...basePayload, mentionMe: false });
    if (mentioned.length > 0) emitToUsers(mentioned, SocketEvent.CONVERSATION_ACTIVITY, { ...basePayload, mentionMe: true });
  }

  contentRoom(scopeId: string): string {
    return ROOM.conversation(scopeId);
  }

  searchable(): boolean {
    return true;
  }

  /**
   * p1-06 be.md §5.2 bước 3 — `USER` mention phải là member ACTIVE của hội
   * thoại (mirror `channel-message-scope.adapter.ts#validateMentions`).
   * DIRECT chỉ có 2 member ACTIVE (bạn + người kia) nên tự nhiên giới hạn
   * đúng "chỉ người kia" — không cần nhánh riêng theo `kind`. `ROLE`/`ALL`
   * KHÔNG qua hook này (`MentionService` xử lý riêng ở tầng `modules/mentions`
   * — `@all` theo `settings.mentionAllRole`, `ROLE` luôn bị từ chối P0).
   */
  async validateMentions(scopeId: string, mentions: MentionValidationInput[]): Promise<MentionValidationResult> {
    const invalid: MentionValidationInput[] = mentions.filter((m) => m.type !== "USER");
    const userMentions = mentions.filter((m) => m.type === "USER");

    if (userMentions.length > 0) {
      const memberIds = new Set(await listActiveMemberIds(scopeId));
      for (const m of userMentions) {
        if (!m.targetId || !memberIds.has(m.targetId)) invalid.push(m);
      }
    }

    return invalid.length > 0 ? { valid: false, invalidMentions: invalid } : { valid: true };
  }
}

export function createConversationMessageScopeAdapter(): ConversationMessageScopeAdapter {
  return new ConversationMessageScopeAdapter();
}
