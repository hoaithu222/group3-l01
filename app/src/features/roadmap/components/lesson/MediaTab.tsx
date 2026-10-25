import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/style/cn';

import type { Block, RoadmapMediaDto } from '../../api/roadmap.types';
import {
  collectImageAlts,
  mediaLabel,
  parseMediaCaption,
  prettyFileName,
} from '../../utils/media-caption';
import { roadmapMediaHref } from '../../utils/roadmap-routes';
import { MediaPreview } from '../blocks/MediaPreview';

export interface MediaTabProps {
  header?: ReactNode;
  /** Khối nội dung của buổi — lấy chú thích cho từng hình (media nhập từ giáo trình không có `caption`). */
  blocks: readonly Block[];
  lessonId: string;
  loading: boolean;
  media: readonly RoadmapMediaDto[];
}

/** Ô lưới dáng DỌC 3:4 — mockup giáo trình là khổ dọc (900×1500), ô vuông để lại hai dải trống lớn hai bên. */
const CELL_ASPECT = 3 / 4;

interface CellText {
  title: string;
  subtitle: string | null;
}

/**
 * Tên ô: chú thích admin → tên tệp ("Product card mockup" — khác nhau giữa các ô) → nhãn trong bài. ⚠️ Không lấy nhãn
 * trong bài làm tên chính: mọi mockup đều mở đầu "Ảnh mockup mẫu:", cả lưới sẽ trùng một tên. Mô tả trong bài làm dòng phụ.
 */
function cellText(item: RoadmapMediaDto, alt: string | undefined, index: number): CellText {
  const parsed = parseMediaCaption(alt);
  const caption = item.caption?.trim();
  if (caption) return { subtitle: parsed.description, title: caption };
  const fromFile = item.fileName ? prettyFileName(item.fileName) : '';
  if (fromFile) return { subtitle: parsed.description ?? parsed.title, title: fromFile };
  return { subtitle: parsed.description, title: parsed.title ?? mediaLabel(item, index) };
}

function MediaCell({
  item,
  lessonId,
  text,
}: {
  item: RoadmapMediaDto;
  lessonId: string;
  text: CellText;
}) {
  const label = text.subtitle ? `${text.title}. ${text.subtitle}` : text.title;
  return (
    <Pressable
      accessibilityHint="Mở toàn màn hình để phóng to"
      accessibilityLabel={label}
      accessibilityRole="imagebutton"
      className="w-1/2 px-2xs pb-sm"
      onPress={() => router.push(roadmapMediaHref(lessonId, item.id))}
    >
      {({ pressed }) => (
        <View
          className={cn(
            'gap-xs rounded-md border border-border-1 p-xs',
            pressed ? 'bg-bg-3' : 'bg-bg-1',
          )}
        >
          <View className="w-full overflow-hidden rounded-xs" style={{ aspectRatio: CELL_ASPECT }}>
            <MediaPreview alt={label} decorative fill media={item} />
          </View>
          <View className="gap-3xs px-3xs pb-3xs">
            <Text className="text-caption-lg font-semibold text-fg-1" numberOfLines={2}>
              {text.title}
            </Text>
            {text.subtitle ? (
              <Text className="text-caption-sm text-fg-2" numberOfLines={2}>
                {text.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Nhóm hiển thị theo `media.group` ("Tại lớp" · "Bài về nhà" · "Minh hoạ", README §3) — thiếu nhóm ⇒ "Khác". */
function groupMedia(media: readonly RoadmapMediaDto[]): [string, RoadmapMediaDto[]][] {
  const byGroup = new Map<string, RoadmapMediaDto[]>();
  for (const item of media) {
    const key = item.group ?? 'Khác';
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  return Array.from(byGroup.entries());
}

/**
 * Tab Hình ảnh (app.md §3): lưới 2 cột theo nhóm — mockup SVG (tại lớp/bài về nhà) + ảnh admin tải lên. Mỗi ô có TÊN
 * hình lấy từ chính bài ("Ảnh mockup mẫu" của bài 3.1…), không phải một lưới ảnh câm phải bấm từng ô mới biết là gì.
 */
export function MediaTab({ blocks, header, lessonId, loading, media }: MediaTabProps) {
  const alts = useMemo(() => collectImageAlts(blocks), [blocks]);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-md px-md pb-xl pt-xs"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {loading ? (
        <View className="flex-row gap-sm">
          <Skeleton className="h-56 flex-1 rounded-md" />
          <Skeleton className="h-56 flex-1 rounded-md" />
        </View>
      ) : media.length === 0 ? (
        <EmptyState
          description="Buổi này chưa có hình minh hoạ."
          icon="image"
          title="Chưa có hình ảnh"
          tone="success"
        />
      ) : (
        groupMedia(media).map(([group, items]) => (
          <Section key={group} title={`${group} · ${String(items.length)}`}>
            <View className="-mx-2xs flex-row flex-wrap">
              {items.map((item) => (
                <MediaCell
                  key={item.id}
                  item={item}
                  lessonId={lessonId}
                  text={cellText(item, alts.get(item.id), media.indexOf(item))}
                />
              ))}
            </View>
          </Section>
        ))
      )}
    </ScrollView>
  );
}
