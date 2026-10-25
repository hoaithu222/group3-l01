import { Pressable, Text, View } from 'react-native';

import { AvatarGroup, type AvatarGroupUser } from '@/shared/ui/avatar-group';
import { Icon } from '@/shared/ui/icon';

import type { ConversationDetail } from '../../api/conversations.types';
import { conversationTitle } from '../../utils/conversation-title';
import { ConversationAvatar } from '../ConversationAvatar';
import { GroupAvatarPicker } from '../GroupAvatarPicker';

export interface GroupInfoHeroProps {
  conversation: ConversationDetail;
  /** Vài thành viên đầu (đã tải cho `TransferOwnerSheet`) — vẽ thành hàng avatar chồng nhau; rỗng thì chỉ còn số thành viên. */
  previewMembers: readonly AvatarGroupUser[];
  onRename: () => void;
}

/**
 * Đầu trang "Thông tin nhóm": ảnh nhóm 64dp (chạm để đổi khi có quyền) · tên (chạm để đổi tên khi có quyền, kèm bút chì) · hàng avatar
 * thành viên + số thành viên · ghi chú nhóm của cuộc họp. Ảnh THẬT của thành viên lấy từ danh sách đã tải sẵn — không gọi thêm API.
 */
export function GroupInfoHero({ conversation, previewMembers, onRename }: GroupInfoHeroProps) {
  const canRename = conversation.myPermissions.canRename;
  const title = conversationTitle(conversation);

  return (
    <View className="items-center gap-sm">
      {/* Avatar tách khỏi Pressable đổi tên bên dưới: hai vùng chạm khác hành động (đổi ảnh / đổi tên), gộp chung một Pressable thì
          chạm vào ảnh lại mở nhầm sheet đổi tên. Ẩn hẳn nút đổi ảnh khi không có quyền — cùng hạng quyền `conversation.update` với đổi tên. */}
      {canRename ? (
        <GroupAvatarPicker conversation={conversation} size="xl" />
      ) : (
        <ConversationAvatar item={conversation} showPresence={false} size="xl" />
      )}
      {/* Tên nhóm chỉ là nút khi có quyền đổi tên: không thì để đọc như chữ thường, đừng xướng "nút" mà chạm vào không có gì.
          `hitSlop` dọc: chữ 18/24 chỉ cao 24dp — nới lên 44dp mà không phình khối. */}
      <Pressable
        accessibilityHint={canRename ? 'Chạm để đổi tên nhóm' : undefined}
        accessibilityRole={canRename ? 'button' : undefined}
        className="max-w-full flex-row items-center gap-2xs active:opacity-70"
        disabled={!canRename}
        hitSlop={{ bottom: 10, left: 8, right: 8, top: 10 }}
        onPress={onRename}
      >
        {/* `flex-shrink`: `Text` trong hàng ngang mặc định không co — tên nhóm dài đẩy bút chì (và chính nó) tràn khỏi mép màn. */}
        <Text className="flex-shrink text-center text-header-sm font-semibold text-fg-1">
          {title}
        </Text>
        {canRename ? <Icon color="fg-2" name="edit" size={16} /> : null}
      </Pressable>
      <View className="flex-row items-center gap-xs">
        {previewMembers.length > 0 ? (
          <AvatarGroup max={4} size="xs" users={previewMembers} />
        ) : null}
        <Text className="text-body-md text-fg-2">{`${String(conversation.memberCount)} thành viên`}</Text>
      </View>
      {conversation.isMeetingGroup ? (
        <View className="flex-row items-center gap-2xs px-md">
          <Icon color="fg-2" name="calendar" size={14} />
          <Text className="flex-shrink text-center text-caption-sm text-fg-2">
            Nhóm của cuộc họp — thành viên do cuộc họp quản lý
          </Text>
        </View>
      ) : null}
    </View>
  );
}
