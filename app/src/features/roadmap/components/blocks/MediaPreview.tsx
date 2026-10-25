import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail } from '@/shared/ui/card';

import type { RoadmapMediaDto } from '../../api/roadmap.types';
import { SvgMedia } from './SvgMedia';

export interface MediaPreviewProps {
  alt: string;
  decorative?: boolean;
  /** Lấp đầy khung cha cố định (ô nhỏ vuông) — xem `SvgMedia.fill`. */
  fill?: boolean;
  maxHeight?: number;
  media: RoadmapMediaDto;
}

/** Ảnh admin tải lên — xin URL ký lúc vẽ (≤ 60 s, `cachePolicy="none"` như `StudyAssetImage`). */
function AssetPreview({ alt, assetId, fill, media }: { alt: string; assetId: string; fill: boolean; media: RoadmapMediaDto }) {
  const { data } = useAssetUrl(assetId);
  const ratio = media.width && media.height && media.width > 0 && media.height > 0 ? media.width / media.height : undefined;
  return (
    <Thumbnail
      alt={alt}
      aspect={fill ? 1 : (ratio ?? 'banner-slim')}
      cachePolicy="none"
      source={data ? { uri: data.url } : undefined}
    />
  );
}

/**
 * MỘT media của buổi (SVG inline hoặc ảnh tải lên) — dùng chung cho hình trong bài, dòng nhắc lại, lưới tab Hình ảnh.
 * Media không có nội dung vẽ được (SVG rỗng, asset thiếu) ⇒ `null`, nơi gọi tự quyết ô thay thế.
 */
export function MediaPreview({ alt, decorative = false, fill = false, maxHeight, media }: MediaPreviewProps) {
  if (media.kind === 'SVG' && media.svg) {
    return (
      <SvgMedia
        alt={alt}
        decorative={decorative}
        fill={fill}
        height={media.height}
        maxHeight={maxHeight}
        svg={media.svg}
        width={media.width}
      />
    );
  }
  if (media.assetId) return <AssetPreview alt={alt} assetId={media.assetId} fill={fill} media={media} />;
  return null;
}
