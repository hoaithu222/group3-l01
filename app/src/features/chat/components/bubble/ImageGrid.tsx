import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';

import type { MessageAttachment } from '../../api/chat.types';
import { useAssetImage } from '../../hooks/useAssetImage';
import { forgetLocalPreview, getLocalPreview } from '../../store/local-previews';

/** ⛔ BẮT BUỘC — xem `Avatar.tsx`/`AttachmentTray.tsx`: `expo-image` không nằm trong danh sách NativeWind hiểu `className`. */
const GridImage = cssInterop(Image, { className: 'style' });

const MAX_SINGLE_WIDTH = 240;
const MAX_SINGLE_HEIGHT = 320;

function singleImageSize(att: MessageAttachment): { width: number; height: number } {
  const w = att.width ?? MAX_SINGLE_WIDTH;
  const h = att.height ?? MAX_SINGLE_HEIGHT;
  const ratio = Math.min(MAX_SINGLE_WIDTH / w, MAX_SINGLE_HEIGHT / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

interface TileStyle {
  width?: number;
  height: number;
  flex?: number;
}

interface TilePosition {
  /** Số thứ tự (từ 0) trong lưới. */
  index: number;
  total: number;
}

function Tile({
  attachment,
  position,
  style,
  onPress,
}: {
  attachment: MessageAttachment;
  /** Có thì nhãn trợ năng đánh số ("Ảnh 2 trên 4") — một lưới nhiều ảnh mà mọi ô cùng xướng "Ảnh đính kèm" thì không phân biệt được. */
  position?: TilePosition;
  style?: TileStyle;
  onPress: () => void;
}) {
  // Ô lưới ~96 dp ⇒ bản THUMB (≤ 320 px, vài chục KB) là đủ nét; ảnh đơn lớn (≤ 240×320 dp) giữ bản gốc (đã được nén ở máy gửi). Chỉ xin THUMB khi
  // BE báo có (`thumbnailAssetId`) — tin cũ/ảnh chưa dựng được thumbnail mà xin THUMB sẽ 404 `ASSET_008`.
  const variant = position && attachment.thumbnailAssetId ? 'THUMB' : 'ORIGINAL';
  // Ảnh do CHÍNH MÌNH vừa gửi: đã có file trên máy ⇒ vẽ luôn, khỏi xin URL ký (truyền `undefined` ⇒ `useAssetUrl` không gọi mạng).
  const [localGone, setLocalGone] = useState(false);
  const localUri = localGone ? undefined : getLocalPreview(attachment.assetId);
  const image = useAssetImage(localUri ? undefined : attachment.assetId, variant);
  // Có ảnh cục bộ thì `image` bị tắt (không assetId) và luôn trả `failed` — đừng để nó lộ ra nhãn/hành vi "tải lại".
  const failed = !localUri && image.state === 'failed';
  const name = position ? `Ảnh ${position.index + 1} trên ${position.total}` : 'Ảnh đính kèm';

  return (
    <Pressable
      accessibilityLabel={failed ? `${name}, không tải được, chạm để thử lại` : `${name}, chạm để xem`}
      accessibilityRole="imagebutton"
      className="overflow-hidden rounded-xs bg-bg-2"
      style={style}
      onPress={failed ? image.retry : onPress}
    >
      {localUri ? (
        <GridImage
          className="h-full w-full"
          contentFit="cover"
          recyclingKey={attachment.assetId}
          source={{ uri: localUri }}
          onError={() => {
            forgetLocalPreview(attachment.assetId);
            setLocalGone(true);
          }}
        />
      ) : image.state === 'loading' ? (
        <Skeleton className="h-full w-full" />
      ) : image.state === 'failed' ? (
        <View className="h-full w-full items-center justify-center gap-3xs">
          <Icon color="fg-2" name="image" size={24} />
          <Text className="text-label-xs text-fg-2">Chạm để tải lại</Text>
        </View>
      ) : (
        // Cache theo `cacheKey` = id asset + biến thể (KHÔNG theo URL ký — URL đổi mỗi ~60 s nên cache theo URL vô dụng): nội dung asset bất biến
        // nên cuộn lại danh sách không tải lại ảnh. `'memory'` (không ghi đĩa) — ảnh chat riêng tư không nằm lại trên máy sau đăng xuất.
        // `onError` đi qua `useAssetImage`: 403 do URL hết hạn ⇒ xin URL mới một lần, không để ô ảnh vẽ trong suốt trong im lặng.
        <GridImage
          cachePolicy="memory"
          className="h-full w-full"
          contentFit="cover"
          recyclingKey={attachment.assetId}
          source={{ uri: image.url, cacheKey: `${attachment.assetId}:${variant}` }}
          onError={image.onImageError}
        />
      )}
    </Pressable>
  );
}

export interface ImageGridProps {
  attachments: MessageAttachment[];
  onOpen: (index: number) => void;
}

/** 1 ảnh: tỉ lệ thật (trần 240×320); 2–4: lưới; 5: 2+3 (app.md §3). */
export function ImageGrid({ attachments, onOpen }: ImageGridProps) {
  if (attachments.length === 0) return null;

  if (attachments.length === 1) {
    const first = attachments[0];
    if (!first) return null;
    return <Tile attachment={first} style={singleImageSize(first)} onPress={() => onOpen(0)} />;
  }

  const rows: MessageAttachment[][] =
    attachments.length === 5
      ? [attachments.slice(0, 2), attachments.slice(2, 5)]
      : [attachments.slice(0, 2), attachments.slice(2, 4)].filter((r) => r.length > 0);

  let cursor = 0;
  return (
    <View className="w-60 gap-3xs">
      {rows.map((row, rowIndex) => (
         
        <View key={rowIndex} className="flex-row gap-3xs">
          {row.map((att) => {
            const index = cursor;
            cursor += 1;
            return (
              <Tile
                key={att.assetId}
                attachment={att}
                position={{ index, total: attachments.length }}
                style={{ height: 96, flex: 1 }}
                onPress={() => onOpen(index)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
