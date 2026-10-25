import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { MediaViewer } from '@/shared/ui/media-viewer';
import { ScreenState } from '@/shared/ui/screen-state';

import type { RoadmapMediaDto } from '../api/roadmap.types';
import { SvgViewer } from '../components/viewer/SvgViewer';
import { useRoadmapLesson, useRoadmapMedia } from '../queries/roadmap.queries';
import {
  collectImageAlts,
  mediaLabel,
  parseMediaCaption,
  prettyFileName,
} from '../utils/media-caption';

function AssetMediaViewer({ assetId, caption }: { assetId: string; caption: string }) {
  const { data, isPending } = useAssetUrl(assetId);
  if (isPending || !data) return <ScreenState state="loading" />;
  return (
    <MediaViewer
      items={[{ accessibilityLabel: caption, type: 'image', uri: data.url }]}
      onClose={() => router.back()}
    />
  );
}

/** Tiêu đề + mô tả của hình: chú thích admin → nhãn trong bài ("Ảnh mockup mẫu: …") → tên tệp. */
function captionOf(media: RoadmapMediaDto, alt: string | undefined, index: number) {
  const parsed = parseMediaCaption(media.caption?.trim() || alt);
  const fromFile = media.fileName ? prettyFileName(media.fileName) : '';
  return {
    description: parsed.description,
    title: parsed.title ?? (fromFile || mediaLabel(media, index)),
  };
}

/**
 * Xem ảnh/SVG toàn màn (app.md §3, RM-06) — `mediaId` không có endpoint riêng phía BE (be.md §4 chỉ có
 * `GET /roadmap/lessons/:id/media` theo BUỔI), nên đọc kèm `lessonId` (tham số phụ do `roadmapMediaHref` gắn thêm) và
 * lọc trong danh sách media của buổi đó — thường ăn thẳng cache đã tải từ màn buổi học. Chú thích lấy từ khối ảnh
 * trong bài (cache `useRoadmapLesson`, cùng buổi).
 *
 * Ảnh asset (`kind: 'ASSET'`): `MediaViewer` dùng chung (pinch/chạm đúp để phóng, vuốt xuống để đóng).
 * SVG inline (`kind: 'SVG'`): `SvgViewer` — phóng to bằng cử chỉ (chạy cả Android), "Hình trước/sau" đổi `mediaId`
 * bằng `setParams` (cùng màn, không chồng thêm màn xem ảnh lên ngăn xếp).
 */
export function RoadmapMediaViewerScreen() {
  const { lessonId, mediaId } = useLocalSearchParams<{ lessonId: string; mediaId: string }>();
  const query = useRoadmapMedia(lessonId);
  const lesson = useRoadmapLesson(lessonId).data;
  const alts = useMemo(() => collectImageAlts(lesson?.blocks ?? []), [lesson?.blocks]);
  const items = query.data ?? [];
  const index = items.findIndex((item) => item.id === mediaId);
  const media = index >= 0 ? items[index] : undefined;

  if (!media) {
    if (query.isLoading) return <ScreenState state="loading" />;
    return (
      <ScreenState
        action={{ label: 'Đóng', onPress: () => router.back() }}
        icon="image"
        state="empty"
        title="Không tìm thấy ảnh"
      />
    );
  }

  const caption = captionOf(media, alts.get(media.id), index);

  if (media.kind === 'ASSET' && media.assetId) {
    return <AssetMediaViewer assetId={media.assetId} caption={caption.title} />;
  }

  if (media.kind === 'SVG' && media.svg) {
    const prev = items[index - 1];
    const next = items[index + 1];
    return (
      <SvgViewer
        description={caption.description}
        index={index}
        media={{ ...media, svg: media.svg }}
        title={caption.title}
        total={items.length}
        onClose={() => router.back()}
        onNext={next ? () => router.setParams({ mediaId: next.id }) : undefined}
        onPrev={prev ? () => router.setParams({ mediaId: prev.id }) : undefined}
      />
    );
  }

  return (
    <ScreenState
      action={{ label: 'Đóng', onPress: () => router.back() }}
      icon="image"
      state="empty"
      title="Không xem được ảnh này"
    />
  );
}
