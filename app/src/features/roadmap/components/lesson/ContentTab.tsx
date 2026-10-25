import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import type { RoadmapLessonDto, RoadmapMediaDto } from '../../api/roadmap.types';
import { extractToc } from '../../utils/block-anchors';
import { inlineMarkdownToSpans } from '../../utils/inline-markdown';
import { primaryImageBlocks } from '../../utils/media-caption';
import { roadmapMediaHref } from '../../utils/roadmap-routes';
import { BlockMediaContext, type BlockMediaContextValue } from '../blocks/block-context';
import { BlockList } from '../blocks/BlockList';
import { Spans } from '../blocks/Spans';
import { TocSheet } from './TocSheet';

export interface ContentTabProps {
  header?: ReactNode;
  lesson: RoadmapLessonDto;
  /** Media của buổi — `undefined` khi chưa tải xong hoặc buổi không có ảnh. */
  media: readonly RoadmapMediaDto[] | undefined;
  mediaLoading: boolean;
}

/** Bù trước vị trí cuộn tới — tiêu đề không dính sát mép trên màn (app.md §7.3). */
const ANCHOR_SCROLL_PADDING = 16;

/**
 * Tab Nội dung (app.md §3): thẻ Mục tiêu + nút mục lục + `BlockList`. Hình mockup hiện NGAY TRONG BÀI (`ImageBlock`,
 * chạm để phóng to) nhờ `BlockMediaContext` — trước đây chỉ là dòng chữ "code/x.svg — mở trong trình duyệt để xem".
 */
export function ContentTab({ header, lesson, media, mediaLoading }: ContentTabProps) {
  const scrollRef = useRef<ScrollView>(null);
  const anchorOffsetsRef = useRef<Record<string, number>>({});
  const blockListYRef = useRef(0);
  const [tocVisible, setTocVisible] = useState(false);
  const toc = useMemo(() => extractToc(lesson.blocks), [lesson.blocks]);

  const mediaContext = useMemo<BlockMediaContextValue>(
    () => ({
      mediaById: Object.fromEntries((media ?? []).map((item) => [item.id, item])),
      mediaLoading,
      onOpenMedia: (mediaId) => router.push(roadmapMediaHref(lesson.id, mediaId)),
      primaryImages: primaryImageBlocks(lesson.blocks),
    }),
    [lesson.blocks, lesson.id, media, mediaLoading],
  );

  const handleBlockListLayout = (event: LayoutChangeEvent) => {
    blockListYRef.current = event.nativeEvent.layout.y;
  };

  const handleAnchorLayout = (anchor: string, y: number) => {
    anchorOffsetsRef.current[anchor] = y;
  };

  const handleSelectAnchor = (anchor: string) => {
    setTocVisible(false);
    const y = anchorOffsetsRef.current[anchor];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({
      animated: true,
      y: blockListYRef.current + y - ANCHOR_SCROLL_PADDING,
    });
  };

  return (
    <>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-md px-md pb-xl pt-xs"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {lesson.objectives.length > 0 ? (
          <Card title="Mục tiêu buổi học">
            <View className="gap-xs">
              {lesson.objectives.map((objective, index) => (
                <View key={index} className="flex-row gap-xs">
                  {/* Dấu tích hai tông màu thương hiệu thay chấm "•" — "học xong sẽ làm được"; ⚠️ `fg-brand` chứ không `success`
                      để không đọc thành "đã đạt". `mt-3xs` căn icon 16dp vào giữa dòng chữ 20dp đầu tiên. Trang trí (không nhãn). */}
                  <View className="mt-3xs">
                    <Icon color="fg-brand" name="checkmark-circle" size="xs" variant="twotone" />
                  </View>
                  <Text className="flex-1 text-body-md text-fg-1">
                    <Spans spans={inlineMarkdownToSpans(objective)} />
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {toc.length > 0 ? (
          <Button
            iconLeft="contact-list"
            label={`Mục lục · ${String(toc.length)} phần`}
            size="sm"
            variant="tertiary"
            onPress={() => setTocVisible(true)}
          />
        ) : null}

        <View onLayout={handleBlockListLayout}>
          <BlockMediaContext.Provider value={mediaContext}>
            <BlockList blocks={lesson.blocks} onAnchorLayout={handleAnchorLayout} />
          </BlockMediaContext.Provider>
        </View>
      </ScrollView>

      <TocSheet
        entries={toc}
        visible={tocVisible}
        onClose={() => setTocVisible(false)}
        onSelect={handleSelectAnchor}
      />
    </>
  );
}
