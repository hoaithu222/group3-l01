import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import type { MediaItem } from '../../api/conversations.types';

function openOriginal(conversationId: string, messageId: string): void {
  router.push({ pathname: '/messages/[conversationId]', params: { conversationId, m: messageId } });
}

/** Ô là VIDEO khi loại tệp nói vậy — `kind` của BE hoặc `mime` (tệp cũ chưa có `kind` chuẩn). */
function isVideo(item: MediaItem): boolean {
  const attachment = item.attachment;
  if (!attachment) return false;
  return (
    attachment.kind.toUpperCase() === 'VIDEO' || attachment.mime.toLowerCase().startsWith('video/')
  );
}

function Thumb({ item, conversationId }: { item: MediaItem; conversationId: string }) {
  const url = useAssetUrl(item.attachment?.assetId, 'THUMB');
  const video = isVideo(item);

  return (
    <Pressable
      accessibilityLabel={video ? 'Video, xem tin nhắn gốc' : 'Xem tin nhắn gốc'}
      accessibilityRole="button"
      className="aspect-square w-[32%] active:opacity-80"
      onPress={() => openOriginal(conversationId, item.messageId)}
    >
      {/* `Thumbnail` chứ không `<Image>` trần của expo-image: URL hết hạn/404/mất mạng thì `expo-image` vẽ TRONG SUỐT và im
          lặng (ô trống trơn); `Thumbnail` nhớ `source` hỏng và quay về ô giữ chỗ. `cachePolicy="none"`: URL ký có hạn. Trang trí
          (không `alt`) — ô bấm đã có nhãn. */}
      <Thumbnail
        aspect="square"
        cachePolicy="none"
        className="rounded-2xs"
        source={url.data ? { uri: url.data.url } : undefined}
      />
      {/* Dấu "phát" cho ô video — không có nó, ảnh bìa video trông y hệt một tấm ảnh. Nền `overlay` (mực 80%, TỐI ở cả hai chế độ)
          nên icon dùng `white-10` (trắng cố định) — ⛔ không `fg-inverse`: ở chế độ tối nó thành màu mực, chìm hẳn vào nền tối. */}
      {video ? (
        <View className="absolute bottom-2xs left-2xs h-6 w-6 items-center justify-center rounded-full bg-overlay">
          <Icon color="white-10" name="play" size={14} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** app.md §3 — lưới 3 cột, bấm → "Xem tin nhắn gốc" (`ConversationScreen ?m=`). */
export function MediaGrid({
  items,
  conversationId,
}: {
  items: MediaItem[];
  conversationId: string;
}) {
  return (
    <View className="flex-row flex-wrap justify-between gap-2xs px-md">
      {items.map((item) => (
        <Thumb
          key={`${item.messageId}-${item.attachment?.assetId ?? ''}`}
          conversationId={conversationId}
          item={item}
        />
      ))}
    </View>
  );
}
