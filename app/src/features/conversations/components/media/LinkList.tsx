import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { MediaItem } from '../../api/conversations.types';

/** app.md §3 — host, url, người gửi; bấm → "Xem tin nhắn gốc". Ô icon tông `accent` — cùng tông lối vào "Liên kết" ở màn Thông tin. */
export function LinkList({
  items,
  conversationId,
}: {
  items: MediaItem[];
  conversationId: string;
}) {
  return (
    <View className="gap-2xs">
      {items.map((item) => (
        <Pressable
          key={item.messageId}
          accessibilityHint="Xem tin nhắn gốc"
          accessibilityLabel={item.link?.url ?? item.link?.host ?? 'Liên kết'}
          accessibilityRole="button"
          className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
          onPress={() =>
            router.push({
              pathname: '/messages/[conversationId]',
              params: { conversationId, m: item.messageId },
            })
          }
        >
          <IconTile name="link" tone="accent" />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
              {item.link?.host ?? ''}
            </Text>
            <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
              {item.link?.url ?? ''}
            </Text>
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </Pressable>
      ))}
    </View>
  );
}
