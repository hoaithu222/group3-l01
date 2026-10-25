import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { encodeCursor } from "../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { getMessageScope, type MessageScope } from "../../messages/public";
import type {
  DiscoveryMessage,
  DiscoveryScopeType,
  SavedItem,
  SavedMessageRecord,
} from "../entities/discovery.interface";
import type { SavedListQueryDto } from "../dtos";
import type { IDiscoveryLookupRepository } from "../repositories/discovery-lookup.repository.interface";
import type { IMessageSearchRepository } from "../repositories/message-search.repository.interface";
import type { ISavedMessageRepository } from "../repositories/saved-message.repository.interface";
import { parseCursorParam } from "./cursor-param";
import { isHiddenForViewer } from "./message-visibility";
import { buildAvailableSavedItem, unavailableSavedItem, type SavedPresenterLookups } from "./saved-item.presenter";

export type ScopeResolver = (scopeType: DiscoveryScopeType) => MessageScope | undefined;
export type UserEmitter = (userIds: string[], event: string, payload: object) => void;

export interface SavedListResult {
  data: SavedItem[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

interface ScopeAccess {
  visible: boolean;
  hiddenBeforeSeq: number;
}

/**
 * Tin đã lưu (be.md p1-09 §5.1/§5.2). Quyền đọc kiểm ở MỌI lần đọc (KHÔNG cache theo
 * bản ghi lưu): mất quyền/rời hội thoại/tin bị thu hồi/bị ẩn → `available: false`,
 * không lộ nội dung hay tên phạm vi (DU-03, SAV-02).
 */
export class SavedService {
  constructor(
    private readonly savedRepo: ISavedMessageRepository,
    private readonly messageRepo: IMessageSearchRepository,
    private readonly lookupRepo: IDiscoveryLookupRepository,
    private readonly resolveScope: ScopeResolver = getMessageScope,
    private readonly emit: UserEmitter = emitToUsers
  ) {}

  /** `POST /messages/:id/save` — idempotent (SAV-01). */
  async save(user: AuthUser, messageId: string): Promise<{ messageId: string; savedAt: Date }> {
    const [message] = await this.messageRepo.findMessagesByIds([messageId]);
    if (!message) throw new NotFoundError();

    const scope = this.resolveScope(message.scopeType);
    if (!scope) throw new NotFoundError();
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) throw new NotFoundError();

    if (message.deletedAt) throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);
    // Tin hệ thống ("X đã tham gia"...) không có nội dung để lưu.
    if (message.kind !== "USER") throw new NotFoundError();

    const viewerCtx = await scope.viewerContext(user, message.scopeId);
    const hidden = await this.messageRepo.findHiddenMessageIds(user.id, [message.id]);
    if (isHiddenForViewer(message, viewerCtx.hiddenBeforeSeq, hidden)) throw new NotFoundError();

    const existing = await this.savedRepo.findByUserAndMessage(user.id, message.id);
    if (existing) return { messageId: message.id, savedAt: existing.createdAt };

    // Đếm-rồi-ghi không nguyên tử: 2 request đồng thời ở đúng ngưỡng có thể vượt 1–2 bản ghi — chấp nhận (giới hạn chống lạm dụng, không phải bất biến).
    if ((await this.savedRepo.countByUser(user.id)) >= LIMITS.saved.max) {
      throw new AppError(ErrorMessages[ErrorCode.SRCH_004], 409, ErrorCode.SRCH_004);
    }

    const { record, created } = await this.savedRepo.create({
      userId: user.id,
      messageId: message.id,
      scopeType: message.scopeType,
      scopeId: message.scopeId,
      workspaceId: message.workspaceId ?? access.workspaceId,
      threadId: message.threadId,
    });
    if (created) this.emit([user.id], SocketEvent.SAVED_UPDATED, { messageId: message.id, saved: true });
    return { messageId: message.id, savedAt: record.createdAt };
  }

  /** `DELETE /messages/:id/save` — KHÔNG kiểm quyền đọc để luôn bỏ lưu được (kể cả tin đã mất quyền); idempotent. */
  async unsave(user: AuthUser, messageId: string): Promise<void> {
    const removed = await this.savedRepo.delete(user.id, messageId);
    if (removed) this.emit([user.id], SocketEvent.SAVED_UPDATED, { messageId, saved: false });
  }

  /** `GET /me/saved` — cursor `(createdAt, id)`, mỗi mục kiểm lại quyền/tombstone/ẩn. */
  async list(user: AuthUser, query: SavedListQueryDto): Promise<SavedListResult> {
    const cursor = parseCursorParam(query.cursor);
    const rows = await this.savedRepo.list({
      userId: user.id,
      scopeType: query.scopeType,
      workspaceId: query.workspaceId,
      before: cursor,
      limit: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const meta = {
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
      limit: query.limit,
    };
    if (page.length === 0) return { data: [], meta };

    const messages = await this.messageRepo.findMessagesByIds(page.map((r) => r.messageId));
    const byId = new Map(messages.map((m) => [m.id, m]));

    const [accessByScope, hidden] = await Promise.all([
      this.loadScopeAccess(user, messages),
      this.messageRepo.findHiddenMessageIds(user.id, messages.map((m) => m.id)),
    ]);

    const readable = new Map<string, DiscoveryMessage>();
    for (const m of messages) {
      const access = accessByScope.get(scopeKey(m));
      if (!access?.visible || m.deletedAt || m.kind !== "USER") continue;
      if (isHiddenForViewer(m, access.hiddenBeforeSeq, hidden)) continue;
      readable.set(m.id, m);
    }

    const lookups = await this.loadLookups(user.id, Array.from(readable.values()));
    const data = page.map((record) => this.toItem(record, byId.get(record.messageId), readable, lookups));
    return { data, meta };
  }

  private toItem(
    record: SavedMessageRecord,
    message: DiscoveryMessage | undefined,
    readable: ReadonlyMap<string, DiscoveryMessage>,
    lookups: SavedPresenterLookups
  ): SavedItem {
    const usable = message ? readable.get(message.id) : undefined;
    if (!usable) return unavailableSavedItem(record);
    return buildAvailableSavedItem(record, usable, lookups) ?? unavailableSavedItem(record);
  }

  /** 1 lần `canRead` + `viewerContext` cho MỖI phạm vi khác nhau (không N lần theo số tin). */
  private async loadScopeAccess(user: AuthUser, messages: readonly DiscoveryMessage[]): Promise<Map<string, ScopeAccess>> {
    const scopes = new Map<string, DiscoveryMessage>();
    for (const m of messages) scopes.set(scopeKey(m), m);

    const entries = await Promise.all(
      Array.from(scopes.entries()).map(async ([key, m]): Promise<[string, ScopeAccess]> => {
        const scope = this.resolveScope(m.scopeType);
        if (!scope) return [key, { visible: false, hiddenBeforeSeq: 0 }];
        const access = await scope.canRead(user, m.scopeId);
        if (!access.visible) return [key, { visible: false, hiddenBeforeSeq: 0 }];
        const ctx = await scope.viewerContext(user, m.scopeId);
        return [key, { visible: true, hiddenBeforeSeq: ctx.hiddenBeforeSeq }];
      })
    );
    return new Map(entries);
  }

  private async loadLookups(viewerId: string, messages: readonly DiscoveryMessage[]): Promise<SavedPresenterLookups> {
    const channelIds = unique(messages.filter((m) => m.scopeType === "CHANNEL").map((m) => m.scopeId));
    const conversationIds = unique(messages.filter((m) => m.scopeType === "CONVERSATION").map((m) => m.scopeId));
    const authorIds = unique(messages.flatMap((m) => (m.authorId ? [m.authorId] : [])));
    const [channels, conversations, authors] = await Promise.all([
      this.lookupRepo.describeChannels(channelIds),
      this.lookupRepo.describeConversations(viewerId, conversationIds),
      this.lookupRepo.userBriefs(authorIds),
    ]);
    return { channels, conversations, authors };
  }
}

function scopeKey(m: { scopeType: DiscoveryScopeType; scopeId: string }): string {
  return `${m.scopeType}:${m.scopeId}`;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
