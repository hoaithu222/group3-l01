import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { MessageAttachment } from '../../api/chat.types';
import { useAssetImage } from '../../hooks/useAssetImage';

const ThumbImage = cssInterop(Image, { className: 'style' });

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export interface VideoThumbProps {
  attachment: MessageAttachment;
  onPress: () => void;
}

/** Poster (`thumbnailAssetId`) + thời lượng — phát trong `MediaViewer`, KHÔNG tự phát (app.md §3, §7). */
export function VideoThumb({ attachment, onPress }: VideoThumbProps) {
  const image = useAssetImage(attachment.thumbnailAssetId ?? attachment.assetId, attachment.thumbnailAssetId ? 'ORIGINAL' : 'POSTER');

  return (
    <Pressable
      accessibilityLabel={`Video ${formatDuration(attachment.durationMs)}, chạm để phát`}
      accessibilityRole="imagebutton"
      className="h-40 w-60 overflow-hidden rounded-xs bg-bg-2"
      onPress={onPress}
    >
      {image.state === 'ready' ? (
        // `onError` qua `useAssetImage`: poster hỏng (URL ký hết hạn) ⇒ xin URL mới một lần, rồi rơi về ô giữ chỗ — không vẽ trong suốt.
        <ThumbImage
          cachePolicy="none"
          className="h-full w-full"
          contentFit="cover"
          source={{ uri: image.url }}
          onError={image.onImageError}
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Icon color="fg-2" name="image" size={28} />
        </View>
      )}
      {/* ⛔ `white-10` (trắng CỐ ĐỊNH) chứ không `fg-inverse`: nền `overlay` là mực 80% TỐI ở cả hai chế độ, còn `fg-inverse` ở chế
          độ tối lại là màu MỰC (#08120F) — nút phát và thời lượng chìm mất trên nền tối. */}
      <View className="absolute inset-0 items-center justify-center">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-overlay">
          <Icon color="white-10" name="play" size={24} />
        </View>
      </View>
      {attachment.durationMs ? (
        <View className="absolute bottom-2xs right-2xs rounded-3xs bg-overlay px-2xs py-3xs">
          <Text className="text-label-xs text-white-10">{formatDuration(attachment.durationMs)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
