import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useConnectionState, usePresence } from '@/core/socket';
import { CallActionsSlot } from '@/shared/calls';
import { useBreakpoint } from '@/shared/theme';
import { ActionMenu } from '@/shared/ui/action-menu';
import { AppBar } from '@/shared/ui/navigation';

import type { ConversationDetail } from '../api/conversations.types';
import { conversationTitle } from '../utils/conversation-title';
import { ConversationAvatar } from './ConversationAvatar';

const PRESENCE_LABEL: Record<string, string> = {
  ONLINE: 'Đang hoạt động',
  IDLE: 'Vắng mặt',
  DND: 'Không làm phiền',
  OFFLINE: 'Ngoại tuyến',
  HIDDEN: 'Ngoại tuyến',
};

function openInfo(id: string): void {
  router.push({ pathname: '/messages/[conversationId]/info', params: { conversationId: id } });
}

/** p1-09: Tìm/Ghim chỉ ĐẨY ROUTE `search`/`pins` (màn của feature `discovery` — `conversations` không import nó). */
function openSearch(id: string): void {
  router.push({ pathname: '/messages/[conversationId]/search', params: { conversationId: id } });
}

function openPins(id: string): void {
  router.push({ pathname: '/messages/[conversationId]/pins', params: { conversationId: id } });
}

function openMembers(id: string): void {
  router.push({ pathname: '/messages/[conversationId]/members', params: { conversationId: id } });
}

/**
 * app.md §3 — tên + trạng thái/số thành viên, bấm → info. Nút gọi thoại/video (p2-01) vào qua slot `@/shared/calls`
 * (`conversations` không import `calls`): không vẽ gì khi cờ `voice` tắt; KHOÁ kèm nhãn lý do khi `myPermissions.canCall = false`.
 *
 * Thanh tiêu đề: nút gọi (hành động CHÍNH của phòng chat 1-1/nhóm, do slot vẽ) + menu "⋯" `ActionMenu` chứa Tìm · Tin đã ghim ·
 * Thành viên (chỉ nhóm) · Thông tin — CÙNG thứ tự/nhãn với `ChannelHeader`. Bản cũ nhét 5 nút 40dp (~212dp) nên tên người
 * đối diện chỉ còn ~60dp; và nút "…" cũ THỰC RA chỉ mở màn Thông tin (icon nói "menu" mà bấm ra một màn), trùng luôn với
 * việc chạm ảnh đại diện. Chạm ảnh đại diện vẫn mở Thông tin — lối tắt quen thuộc, không bỏ.
 *
 * ⚠️ "Hoạt động 5 phút trước" của app.md không hiện được: `ConversationListItemPeer`
 * (be.md §4) chỉ có `presence` (trạng thái hiện tại), không có mốc lần cuối
 * hoạt động — hiện đúng những gì hợp đồng có (nhãn trạng thái), không suy diễn
 * thêm dữ liệu server không trả.
 */
export function ConversationHeader({ conversation }: { conversation: ConversationDetail }) {
  const { isTablet } = useBreakpoint();
  const title = conversationTitle(conversation);
  // Hiện diện của NGƯỜI KIA: ưu tiên dữ liệu sống (`presence:updated` qua socket) — `conversation.peer.presence` chỉ là ảnh chụp
  // lúc tải chi tiết nên chat giữa hai máy vẫn ghi "Ngoại tuyến" dù người kia đang online. Khi CHÍNH MÌNH mất kết nối thì dữ liệu
  // sống cũng cũ ⇒ không ghi gì (tránh "Ngoại tuyến" bị đọc thành "bạn đang ngoại tuyến"; tình trạng của mình do `ConnectionBanner` lo).
  const isDirect = conversation.kind === 'DIRECT';
  const connection = useConnectionState();
  const livePresence = usePresence(isDirect ? conversation.peer?.userId : undefined);
  const presence = livePresence.updatedAt > 0 ? livePresence.state : (conversation.peer?.presence ?? '');
  const showPresence = isDirect && connection === 'connected';
  const subtitle = isDirect
    ? showPresence
      ? PRESENCE_LABEL[presence]
      : undefined
    : `${String(conversation.memberCount)} thành viên`;
  const avatarItem = isDirect && conversation.peer ? { ...conversation, peer: { ...conversation.peer, presence } } : conversation;

  return (
    <AppBar
      actions={
        <View className="flex-row items-center gap-2xs">
          <CallActionsSlot
            disabledReason={conversation.myPermissions.canCall ? null : 'cuộc trò chuyện đang chỉ đọc hoặc đã chặn nhau'}
            memberCount={conversation.memberCount}
            scopeId={conversation.id}
            scopeType="CONVERSATION"
          />
          <ActionMenu
            accessibilityLabel="Thêm tuỳ chọn của cuộc trò chuyện"
            items={[
              { key: 'search', icon: 'search', label: 'Tìm trong cuộc trò chuyện', onPress: () => openSearch(conversation.id) },
              { key: 'pins', icon: 'location', label: 'Tin đã ghim', onPress: () => openPins(conversation.id) },
              {
                key: 'members',
                hidden: conversation.kind === 'DIRECT',
                icon: 'user',
                label: 'Thành viên',
                onPress: () => openMembers(conversation.id),
              },
              { key: 'info', icon: 'alert-information', label: 'Thông tin', onPress: () => openInfo(conversation.id) },
            ]}
            title={title}
          />
        </View>
      }
      leading={
        // Ảnh đại diện 32dp: `hitSlop` 6 bù lên 44dp.
        <Pressable accessibilityLabel="Xem thông tin" accessibilityRole="button" hitSlop={6} onPress={() => openInfo(conversation.id)}>
          <ConversationAvatar item={avatarItem} showPresence={showPresence} size="sm" />
        </Pressable>
      }
      subtitle={subtitle}
      title={title}
      // Hai cột (tablet): danh sách nằm ngay bên trái, không có "màn trước" để lùi về.
      onBack={isTablet ? undefined : router.back}
    />
  );
}
