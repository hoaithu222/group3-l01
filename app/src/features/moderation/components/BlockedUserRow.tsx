import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { BlockedUser } from '../api/moderation.types';

export interface BlockedUserRowProps {
  onUnblock: (user: BlockedUser) => void;
  user: BlockedUser;
}

/** Một dòng của `me/blocked`: ảnh + tên + "Đã chặn dd/MM/yyyy" + nút Bỏ chặn (luôn qua hộp xác nhận). */
export function BlockedUserRow({ onUnblock, user }: BlockedUserRowProps) {
  const name = user.name || 'Người dùng';

  return (
    <View className="flex-row items-center gap-sm px-md py-sm">
      <Avatar name={name} size="md" source={user.avatarUrl ? { uri: user.avatarUrl } : undefined} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-md text-fg-1" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-caption-sm text-fg-2">Đã chặn {formatDate(user.blockedAt)}</Text>
      </View>
      <Button
        accessibilityLabel={`Bỏ chặn ${name}`}
        label="Bỏ chặn"
        size="sm"
        variant="neutral-secondary"
        onPress={() => onUnblock(user)}
      />
    </View>
  );
}
