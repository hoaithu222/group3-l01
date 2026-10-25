import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';

import type { Block } from '../../api/roadmap.types';
import { parseMediaCaption, prettyFileName } from '../../utils/media-caption';
import { useBlockMedia } from './block-context';
import { MediaFigure } from './MediaFigure';
import { MediaRefRow } from './MediaRefRow';

export interface ImageBlockProps {
  block: Extract<Block, { type: 'image' }>;
}

/**
 * Khối ảnh (be.md §5.1 `type: 'image'`) — trỏ `RoadmapMedia` của CHÍNH buổi qua `mediaId` (không nhận URL ảnh ngoài).
 *
 *  · Lần nhắc ĐẦU của một media → `MediaFigure` (hình lớn + chú thích); nhắc LẠI → `MediaRefRow` (dòng gọn) — xem
 *    `primaryImageBlocks`.
 *  · Chú thích: `media.caption` (admin đặt) → `alt` do BE dựng từ dòng giới thiệu mockup ("Ảnh mockup mẫu: …") → tên tệp.
 *  · Media của buổi đang tải → khung xương cùng cỡ (không nhấp nháy "không tìm thấy" rồi mới hiện ảnh).
 *  · `mediaId: null` = BE không khớp được lúc dựng khối (cảnh báo phía import) ⇒ ô "không tìm thấy".
 */
export function ImageBlock({ block }: ImageBlockProps) {
  const { mediaById, mediaLoading, onOpenMedia, primaryImages } = useBlockMedia();
  const media = block.mediaId ? mediaById[block.mediaId] : undefined;

  if (!media) {
    if (block.mediaId && mediaLoading) return <Skeleton className="h-64 w-full rounded-md" />;
    return (
      <View
        accessibilityLabel="Không tìm thấy ảnh"
        accessible
        className="items-center gap-2xs rounded-md bg-bg-2 py-lg"
      >
        <Icon color="fg-2" name="image" size="lg" />
        <Text className="text-caption-sm text-fg-2">Không tìm thấy ảnh</Text>
      </View>
    );
  }

  const caption = parseMediaCaption(media.caption?.trim() || block.alt);
  const title = caption.title ?? (media.fileName ? prettyFileName(media.fileName) : 'Hình minh hoạ');
  const open = onOpenMedia ? () => onOpenMedia(media.id) : undefined;

  return primaryImages.has(block) ? (
    <MediaFigure description={caption.description} media={media} title={title} onOpen={open} />
  ) : (
    <MediaRefRow description={caption.description} media={media} title={title} onOpen={open} />
  );
}
