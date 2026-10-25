import { Text, View } from 'react-native';

import { usePresence } from '@/core/socket';
import { Avatar } from '@/shared/ui/avatar';
import { PresenceDot } from '@/shared/ui/presence-dot';

import type { ChannelMemberRow as ChannelMemberRowData } from '../api';

export interface ChannelMemberRowProps {
  member: ChannelMemberRowData;
}

/** Một dòng thành viên kênh PUBLIC (app.md §3: "danh sách người đã tham gia (presence)"). */
export function ChannelMemberRow({ member }: ChannelMemberRowProps) {
  const live = usePresence(member.userId);
  const presenceState = live.updatedAt > 0 ? live.state : member.presence;

  return (
    <View
      accessibilityLabel={`${member.name}, ${presenceState === 'ONLINE' ? 'đang hoạt động' : 'ngoại tuyến'}`}
      accessible
      className="flex-row items-center gap-sm px-md py-sm"
    >
      <Avatar
        badge={presenceState === 'ONLINE' ? 'success' : undefined}
        name={member.name}
        size="md"
        source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-md text-fg-1" numberOfLines={1}>
          {member.name}
        </Text>
        <PresenceDot showLabel state={presenceState} />
      </View>
    </View>
  );
}
