import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { iconForMime } from '@/shared/ui/file-tile';
import { Icon } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatDate } from '@/shared/utils/format/date.utils';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';

import type { MediaItem } from '../../api/conversations.types';

/**
 * Tông ô icon theo LOẠI tệp (cùng bảng `iconForMime` của `FileTile`): mắt quét ra ngay đâu là tài liệu, đâu là âm thanh/video trong một
 * danh sách toàn tên tệp. Tông chỉ để phân biệt — loại tệp vẫn đọc được qua đuôi tên tệp.
 */
function toneForMime(mime: string | undefined): IconTileTone {
  const type = (mime ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'success';
  if (type.startsWith('video/') || type.startsWith('audio/')) return 'accent';
  // ⛔ Không tô `danger` cho PDF dù nhiều app quen màu đỏ: tông đỏ của bộ này dành cho thao tác PHÁ HUỶ.
  if (type === 'application/pdf') return 'warning';
  return 'info';
}

/** app.md §3 — tên, dung lượng, người gửi, ngày; bấm → "Xem tin nhắn gốc". */
export function FileList({
  items,
  conversationId,
}: {
  items: MediaItem[];
  conversationId: string;
}) {
  return (
    <View className="gap-2xs">
      {items.map((item) => {
        const name = item.attachment?.name ?? 'Tệp';
        const meta = [
          item.attachment ? formatFileSize(item.attachment.size) : '',
          formatDate(item.createdAt),
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={item.messageId}
            accessibilityHint="Xem tin nhắn gốc"
            accessibilityLabel={`${name}, ${meta}`}
            accessibilityRole="button"
            className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
            onPress={() =>
              router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId, m: item.messageId },
              })
            }
          >
            <IconTile
              name={iconForMime(item.attachment?.mime)}
              tone={toneForMime(item.attachment?.mime)}
            />
            <View className="flex-1 gap-3xs">
              <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-caption-sm text-fg-2">{meta}</Text>
            </View>
            <Icon color="fg-2" name="arrow-right-small" size="sm" />
          </Pressable>
        );
      })}
    </View>
  );
}
