import type { ResolveChatAuthor } from '@/features/chat';

export interface AuthorSource {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

export interface SelfAuthor {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Bộ tra `userId → tên/ảnh` cho `ChatRoom.resolveAuthor` (`messages` chỉ trả
 * `authorId`, không sở hữu tên hiển thị — `chat.types.ts#ChatAuthorInfo`).
 *
 * Danh sách người trong kênh ưu tiên; chính mình là dự phòng vì người xem có thể
 * không nằm trong `members` (vd đang xem kênh public chưa tham gia). Không có
 * trong cả hai (tác giả đã rời kênh) thì trả `undefined` — `chat` tự hiện tên tối giản.
 */
export function buildAuthorResolver(
  members: readonly AuthorSource[],
  self?: SelfAuthor | null,
): ResolveChatAuthor {
  const byId = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const member of members) byId.set(member.userId, { name: member.name, avatarUrl: member.avatarUrl ?? null });
  if (self && !byId.has(self.id)) byId.set(self.id, { name: self.name, avatarUrl: self.avatar ?? null });

  return (userId) => byId.get(userId);
}
