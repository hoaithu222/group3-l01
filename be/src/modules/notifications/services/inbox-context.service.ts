import { LIMITS } from "../../../core/constants/limits";
import { avatarUrlOf } from "../../../shared/media";
import type { MessageScopeType } from "../entities/message-notification.types";
import type { NotificationInboxItem } from "../entities/notification.interface";
import type { IInboxContextRepository } from "../repositories/inbox-context.repository.interface";
import { renderMessagePreview } from "./message-preview";

export interface InboxContextDeps {
  repo: IInboxContextRepository;
  /** Quyền đọc HIỆN TẠI của người xem với luồng chứa tin (`permissionService.can`). */
  canRead(userId: string, scopeType: MessageScopeType, scopeId: string): Promise<boolean>;
}

const isMessageScope = (t: string): t is MessageScopeType => t === "CHANNEL" || t === "CONVERSATION";

/**
 * `InboxContextService` (be.md §5.8) — dựng `InboxItem.context` LÚC ĐỌC: kiểm quyền hiện tại theo từng luồng,
 * rồi trích tên luồng + excerpt (≤ 120 grapheme, marker mention → `@tên`). Mất quyền / tin đã thu hồi / bị
 * "xoá phía tôi" → `available:false` và KHÔNG trả excerpt, tên luồng, người thực hiện, id (NT-05: không lộ ngữ cảnh).
 */
export class InboxContextService {
  constructor(private readonly deps: InboxContextDeps) {}

  async enrich(userId: string, items: NotificationInboxItem[]): Promise<NotificationInboxItem[]> {
    if (items.length === 0) return items;

    const messageItems = items.filter((i) => !i.unavailable && i.messageId && i.scopeId && isMessageScope(i.scopeType));
    const scopes = new Map<string, { scopeType: MessageScopeType; scopeId: string }>();
    for (const i of messageItems) {
      scopes.set(`${i.scopeType}:${i.scopeId}`, { scopeType: i.scopeType as MessageScopeType, scopeId: i.scopeId as string });
    }

    const readable = new Set<string>();
    await Promise.all(
      [...scopes.entries()].map(async ([key, s]) => {
        if (await this.deps.canRead(userId, s.scopeType, s.scopeId)) readable.add(key);
      })
    );

    const visibleItems = messageItems.filter((i) => readable.has(`${i.scopeType}:${i.scopeId}`));
    const readableScopes = [...scopes.entries()].filter(([k]) => readable.has(k)).map(([, s]) => s);
    const [messages, scopeInfo, actors] = await Promise.all([
      this.deps.repo.findMessages(visibleItems.map((i) => i.messageId as string)),
      this.deps.repo.loadScopeInfo(
        userId,
        readableScopes.filter((s) => s.scopeType === "CHANNEL").map((s) => s.scopeId),
        readableScopes.filter((s) => s.scopeType === "CONVERSATION").map((s) => s.scopeId)
      ),
      this.deps.repo.loadActors([...new Set(visibleItems.map((i) => i.actorId).filter((id): id is string => !!id))]),
    ]);

    return items.map((item) => {
      if (item.unavailable) return this.hidden(item);
      if (!item.messageId || !item.scopeId || !isMessageScope(item.scopeType)) {
        // Loại phi tin nhắn (cuộc gọi/họp/kênh…) — quyền đã được kiểm lúc giao; không có excerpt.
        return { ...item, context: { available: true, muted: item.muted } };
      }
      const key = `${item.scopeType}:${item.scopeId}`;
      if (!readable.has(key)) return this.hidden(item);

      const message = messages.get(item.messageId);
      const info = scopeInfo.get(key);
      if (!message || message.deletedAt || (info && message.seq <= info.hiddenBeforeSeq)) return this.hidden(item);

      const actor = item.actorId ? actors.get(item.actorId) : undefined;
      return {
        ...item,
        actor: item.actorId && actor?.name ? { userId: item.actorId, name: actor.name, avatarUrl: avatarUrlOf(actor.avatarAssetId) } : null,
        context: {
          available: true,
          ...(info?.name && { scopeName: info.name }),
          excerpt: renderMessagePreview(message, LIMITS.notification.inboxExcerptMaxChars),
          muted: item.muted,
        },
      };
    });
  }

  /** Không lộ gì ngoài loại + thời điểm (be.md §6 "nội dung ngữ cảnh chỉ trả khi còn quyền đọc"). */
  private hidden(item: NotificationInboxItem): NotificationInboxItem {
    return {
      ...item,
      scopeId: null,
      actorId: null,
      refs: null,
      threadId: null,
      messageId: null,
      actor: null,
      unavailable: true,
      context: { available: false, muted: item.muted },
    };
  }
}
