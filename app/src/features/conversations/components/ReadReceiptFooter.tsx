import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { formatTime } from '@/shared/utils/format/date.utils';

import type { ConversationDetail } from '../api/conversations.types';
import { SeenAvatars } from './SeenAvatars';

export interface ReadReceiptFooterProps {
  conversation: ConversationDetail;
  currentUserId: string | undefined;
  liveVersion: number;
}

/**
 * app.md §3 "dưới tin cuối của mình" — `<ChatRoom>` (feature NỀN, p1-04) không
 * xuất state danh sách tin ra props nên không có chỗ chèn footer VÀO ĐÚNG
 * bong bóng cuối; đặt thành một dải CỐ ĐỊNH giữa danh sách và composer, và chỉ
 * hiện khi `conversation.lastMessage` đúng là của CHÍNH mình — hai điều đó
 * cộng lại cho đúng hiệu quả cần có: dải biến mất ngay khi người khác gửi tin
 * mới (lastMessage đổi tác giả), y hệt việc bong bóng "của mình" không còn là
 * bong bóng cuối cùng nữa.
 */
export function ReadReceiptFooter({ conversation, currentUserId, liveVersion }: ReadReceiptFooterProps) {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage || lastMessage.deleted || lastMessage.kind !== 'USER' || lastMessage.authorId !== currentUserId) {
    return null;
  }

  if (conversation.kind === 'DIRECT') {
    const seen = conversation.peerLastReadSeq !== null && conversation.peerLastReadSeq >= lastMessage.seq;
    return (
      // Dấu tick đôi (đã xem, màu thương hiệu) / tick đơn (đã gửi) cạnh chữ — quen mắt như mọi app nhắn tin; chữ vẫn nói rõ trạng thái.
      <View className="flex-row items-center justify-end gap-3xs px-md py-3xs">
        <Icon color={seen ? 'fg-brand' : 'fg-2'} name={seen ? 'tick-double-01' : 'checkmark-circle'} size={14} />
        <Text className="text-caption-sm text-fg-2">
          {seen ? `Đã xem ${formatTime(conversation.peerReadAt ?? lastMessage.createdAt)}` : 'Đã gửi'}
        </Text>
      </View>
    );
  }

  return <SeenAvatars conversationId={conversation.id} liveVersion={liveVersion} seq={lastMessage.seq} />;
}
