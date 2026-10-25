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
 * DIRECT: `peer` của chi tiết hội thoại + chính mình. GROUP: người trong nhóm +
 * chính mình. Chính mình là dự phòng (thành viên đã có thì ưu tiên tên trong
 * nhóm). Tác giả không có trong bộ (đã rời nhóm) → `undefined`, `chat` tự hiện tên tối giản.
 * Bản sao TỐI GIẢN của `channels/utils/author-resolver.ts` — luật "không import
 * chéo feature" (`feature-structure.md`).
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
