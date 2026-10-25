import type { MessageView, ResolveChatAuthor } from '../../api/chat.types';

function nameOf(userId: unknown, resolveAuthor: ResolveChatAuthor | undefined): string {
  return (typeof userId === 'string' && resolveAuthor?.(userId)?.name) || 'Thành viên';
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Câu ngắn cho tin SYSTEM dạng "dòng" (be.md §3 `system-payload.schemas.ts`,
 * §5.7 cột "Render app"). `null` = chưa có dòng riêng cho `systemType` này
 * (thẻ `CALL_SUMMARY`/`MEETING_*` cần p2-01/p2-04 — `UnsupportedSystem` đứng thay).
 */
export function systemLineText(message: MessageView, resolveAuthor: ResolveChatAuthor | undefined): string | null {
  const p = message.systemPayload ?? {};
  const actor = nameOf(p.actorId, resolveAuthor);

  switch (message.systemType) {
    case 'CONVERSATION_CREATED':
      return `${actor} đã tạo cuộc trò chuyện`;
    case 'MEMBER_JOINED':
      return `${nameOf(p.userId, resolveAuthor)} đã tham gia`;
    case 'MEMBER_LEFT':
      return `${nameOf(p.userId, resolveAuthor)} đã rời khỏi`;
    case 'MEMBER_ADDED': {
      const ids = Array.isArray(p.userIds) ? p.userIds : [];
      const names = ids.map((id) => nameOf(id, resolveAuthor)).join(', ');
      return `${actor} đã thêm ${names || 'thành viên'}`;
    }
    case 'MEMBER_REMOVED': {
      const ids = Array.isArray(p.userIds) ? p.userIds : [];
      const names = ids.map((id) => nameOf(id, resolveAuthor)).join(', ');
      return `${actor} đã xoá ${names || 'thành viên'}`;
    }
    case 'ROLE_CHANGED':
      return `${actor} đã đổi vai trò của ${nameOf(p.userId, resolveAuthor)} thành ${str(p, 'to')}`;
    case 'OWNER_TRANSFERRED':
      return `${nameOf(p.fromUserId, resolveAuthor)} đã chuyển quyền chủ sở hữu cho ${nameOf(p.toUserId, resolveAuthor)}`;
    case 'TITLE_CHANGED':
      return `${actor} đã đổi tên thành "${str(p, 'to')}"`;
    case 'AVATAR_CHANGED':
      return `${actor} đã đổi ảnh đại diện`;
    case 'MESSAGE_PINNED':
      return `${actor} đã ghim một tin nhắn`;
    default:
      return null;
  }
}
