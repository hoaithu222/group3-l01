import { Avatar, type AvatarSize } from '@/shared/ui/avatar';
import type { PresenceDotState } from '@/shared/ui/presence-dot';

import type { ConversationListItem } from '../api/conversations.types';
import { conversationAvatarUrl, conversationTitle } from '../utils/conversation-title';

export interface ConversationAvatarProps {
  className?: string;
  item: Pick<ConversationListItem, 'kind' | 'title' | 'avatarUrl' | 'peer'>;
  size?: AvatarSize;
  /** Chấm hiện diện — CHỈ vẽ cho DIRECT (app.md §3 "DIRECT: avatar + presence dot"; GROUP không có một người để đại diện). Đã tôn trọng `showPresence` của người kia ở tầng gọi (BE trả `presence` rỗng/ẩn khi tắt). */
  showPresence?: boolean;
}

/**
 * DIRECT → avatar người kia + chấm hiện diện; GROUP → ảnh nhóm nếu có, hoặc
 * chữ viết tắt tên nhóm. `ConversationListItem` KHÔNG mang avatar từng thành
 * viên (be.md §4) nên "ghép tối đa 4 avatar" của app.md §7 cần dữ liệu chi
 * tiết hơn dòng danh sách có — bỏ qua ở mức HÀNG (tránh N+1 mỗi hàng gọi thêm
 * API), giữ nguyên cho `ConversationInfoScreen` nơi đã có `ConversationDetail`.
 */
export function ConversationAvatar({ className, item, size = 'md', showPresence = true }: ConversationAvatarProps) {
  const url = conversationAvatarUrl(item);
  const title = conversationTitle(item);
  const presence = item.kind === 'DIRECT' && showPresence ? (item.peer?.presence as PresenceDotState | undefined) : undefined;

  return (
    <Avatar
      badge={presence === 'ONLINE' ? 'success' : undefined}
      className={className}
      name={title}
      size={size}
      source={url ? { uri: url } : undefined}
    />
  );
}
