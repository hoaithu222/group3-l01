import { avatarUrlOf } from "../../../shared/media";
import type {
  ChannelInfo,
  ConversationInfo,
  DiscoveryMessage,
  DiscoveryUserBrief,
  SavedItem,
  SavedMessageRecord,
  SavedScopeInfo,
} from "../entities/discovery.interface";
import { buildExcerpt } from "./snippet.util";

export interface SavedPresenterLookups {
  authors: ReadonlyMap<string, DiscoveryUserBrief>;
  channels: ReadonlyMap<string, ChannelInfo>;
  conversations: ReadonlyMap<string, ConversationInfo>;
}

function scopeInfoOf(message: DiscoveryMessage, lookups: SavedPresenterLookups): SavedScopeInfo | null {
  if (message.scopeType === "CHANNEL") {
    const channel = lookups.channels.get(message.scopeId);
    return channel ? { type: "CHANNEL", id: message.scopeId, name: channel.name, isPrivate: channel.isPrivate } : null;
  }
  const conversation = lookups.conversations.get(message.scopeId);
  if (!conversation) return null;
  const name = conversation.kind === "DIRECT" ? conversation.peerName : conversation.title;
  // Hội thoại luôn riêng tư (chỉ thành viên đọc được).
  return { type: "CONVERSATION", id: message.scopeId, name: name ?? "", kind: conversation.kind, isPrivate: true };
}

/**
 * Dựng `SavedItem` khả dụng. `null` khi thiếu thông tin phạm vi (kênh/hội thoại đã bị xoá
 * vật lý) — caller coi như `available: false`. CHỈ gọi cho tin đã qua kiểm quyền/tombstone/ẩn.
 */
export function buildAvailableSavedItem(
  record: SavedMessageRecord,
  message: DiscoveryMessage,
  lookups: SavedPresenterLookups
): SavedItem | null {
  const scope = scopeInfoOf(message, lookups);
  if (!scope) return null;
  const author = message.authorId ? lookups.authors.get(message.authorId) : undefined;
  return {
    savedAt: record.createdAt,
    messageId: record.messageId,
    scopeType: message.scopeType,
    scopeId: message.scopeId,
    workspaceId: message.workspaceId ?? record.workspaceId,
    available: true,
    message: {
      id: message.id,
      authorId: message.authorId,
      authorName: author?.name ?? null,
      authorAvatarUrl: avatarUrlOf(author?.avatarAssetId),
      excerpt: buildExcerpt(message),
      attachmentsSummary: {
        count: message.attachments.length,
        kinds: Array.from(new Set(message.attachments.map((a) => a.kind))),
      },
      createdAt: message.createdAt,
      threadId: message.threadId,
    },
    scope,
  };
}

export function unavailableSavedItem(record: SavedMessageRecord): SavedItem {
  return { savedAt: record.createdAt, messageId: record.messageId, available: false };
}
