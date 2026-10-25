import { Text, View } from 'react-native';

import { usePresence } from '@/core/socket';
import { Avatar } from '@/shared/ui/avatar';
import { PresenceDot, type PresenceDotState } from '@/shared/ui/presence-dot';

import type { ConversationDetail } from '../../api/conversations.types';
import { conversationTitle } from '../../utils/conversation-title';

/** Chỉ hiện trạng thái CÓ thông tin (đang hoạt động / vắng / không làm phiền) — xem chú thích ở component. */
const SHOWN_PRESENCE: ReadonlySet<string> = new Set(['DND', 'IDLE', 'ONLINE']);

/**
 * Đầu trang thông tin 1-1: ảnh người kia 64dp (có chấm xanh khi đang hoạt động) · tên · trạng thái hiện diện bằng CHỮ.
 *
 * Hiện diện ưu tiên dữ liệu SỐNG (`usePresence`, cùng nguồn `ConversationHeader`) rồi mới tới ảnh chụp lúc tải chi tiết. ⚠️ Cố ý KHÔNG
 * hiện "Ngoại tuyến": khi chính máy này mất kết nối thì dữ liệu sống cũng cũ, và dòng "Ngoại tuyến" dễ bị đọc thành "bạn đang ngoại
 * tuyến" — tình trạng của mình do `ConnectionBanner` lo.
 */
export function DirectInfoHero({ conversation }: { conversation: ConversationDetail }) {
  const title = conversationTitle(conversation);
  const peer = conversation.peer;
  const live = usePresence(peer?.userId);
  const presence = live.updatedAt > 0 ? live.state : (peer?.presence ?? '');

  return (
    <View className="items-center gap-xs">
      <Avatar
        badge={presence === 'ONLINE' ? 'success' : undefined}
        name={title}
        size="xl"
        source={peer?.avatarUrl ? { uri: peer.avatarUrl } : undefined}
      />
      <Text className="pt-2xs text-center text-header-sm font-semibold text-fg-1">{title}</Text>
      {SHOWN_PRESENCE.has(presence) ? (
        <PresenceDot showLabel state={presence as PresenceDotState} />
      ) : null}
    </View>
  );
}
