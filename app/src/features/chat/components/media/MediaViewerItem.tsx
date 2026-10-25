import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { cssInterop } from 'nativewind';
import { useWindowDimensions, View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

import type { MessageAttachment } from '../../api/chat.types';
import { useAssetImage } from '../../hooks/useAssetImage';
import { MediaViewerState } from './MediaViewerState';

const ViewerImage = cssInterop(Image, { className: 'style' });

function VideoItem({ url, width, height }: { url: string; width: number; height: number }) {
  // Không tự phát (app.md §7) — `useVideoPlayer` mặc định KHÔNG gọi `player.play()`.
  const player = useVideoPlayer({ uri: url });
  return (
    <VideoView contentFit="contain" nativeControls player={player} style={{ width, height }} />
  );
}

export interface MediaViewerItemProps {
  attachment: MessageAttachment;
}

/**
 * MỘT trang trong pager — ảnh (`contain`, zoom pinch chưa dựng ở lượt này) hoặc video (điều khiển gốc hệ điều hành).
 * Tải URL lỗi / ảnh không vẽ được ⇒ trang báo lỗi kèm "Thử lại" (không để trang đen trống; xem `MediaViewerState`).
 */
export function MediaViewerItem({ attachment }: MediaViewerItemProps) {
  const { width, height } = useWindowDimensions();
  const image = useAssetImage(attachment.assetId);

  if (image.state === 'loading') {
    return (
      <View style={{ width, height }}>
        <Skeleton className="h-full w-full" />
      </View>
    );
  }

  if (image.state === 'failed') {
    // Không truyền `onClose`: thanh công cụ của màn đã có nút "Đóng" nằm đè lên mọi trang.
    return (
      <View style={{ width, height }}>
        <MediaViewerState kind="error" onRetry={image.retry} />
      </View>
    );
  }

  if (attachment.kind === 'VIDEO')
    return <VideoItem height={height} url={image.url} width={width} />;

  return (
    <ViewerImage
      contentFit="contain"
      source={{ uri: image.url }}
      style={{ width, height }}
      onError={image.onImageError}
    />
  );
}
