import { Pressable, Text, View } from 'react-native';

import { usePresence } from '@/core/socket';
import { Avatar } from '@/shared/ui/avatar';
import { PresenceDot, type PresenceDotState } from '@/shared/ui/presence-dot';

import type { MemberListItem } from '../api/conversations.types';
import { RoleBadge } from './RoleBadge';

export interface MemberRowProps {
  member: MemberListItem;
  isMe: boolean;
  onPress: (member: MemberListItem) => void;
}

/**
 * app.md §3 `GroupMembersScreen` — avatar (chấm xanh khi đang hoạt động) + tên + vai trò (huy hiệu CHỮ, `RoleBadge`) + hiện diện.
 * Bản riêng của `conversations` — không import `features/members` (`feature-structure.md`).
 *
 * `active:opacity-70`: hàng tự dựng (không phải `ListItem`) nên phải tự có phản hồi chạm — Android không có gợn sóng mặc định, thiếu nó
 * người dùng không biết cú chạm đã nhận và bấm lần hai (mở tấm hai lần).
 */
export function MemberRow({ member, isMe, onPress }: MemberRowProps) {
  const live = usePresence(member.userId);
  const presence = (live.updatedAt > 0 ? live.state : member.presence) as PresenceDotState;

  return (
    <Pressable
      accessibilityLabel={`${member.name}${isMe ? ', bạn' : ''}`}
      accessibilityRole="button"
      className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
      onPress={() => onPress(member)}
    >
      <Avatar
        badge={presence === 'ONLINE' ? 'success' : undefined}
        name={member.name}
        size="md"
        source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-2xs">
          <Text className="flex-shrink text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {member.name}
          </Text>
          {isMe ? <Text className="text-caption-sm text-fg-2">(Bạn)</Text> : null}
        </View>
        <View className="flex-row items-center gap-xs">
          <RoleBadge role={member.role} />
          <PresenceDot state={presence} />
        </View>
      </View>
    </Pressable>
  );
}
