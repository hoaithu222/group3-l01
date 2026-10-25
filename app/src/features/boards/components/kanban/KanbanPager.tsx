import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { SPACING, useBreakpoint } from '@/shared/theme';
import { SliderDot } from '@/shared/ui/pagination';

import { COLUMN_GAP, PHONE_PAGE_WIDTH_RATIO } from '../../constants/kanban.constants';
import { useDrag } from './drag/drag-context';
import type { KanbanBoardProps } from './kanban.types';
import { KanbanColumn } from './KanbanColumn';

/** Tablet hiện 3 cột, tablet nằm ngang 4 cột (`app.md` §3 "Tablet: 3–4 cột hiển thị cùng lúc"). */
function tabletColumnWidth(width: number, visible: number): number {
  return Math.floor((width - SPACING.md * 2 - COLUMN_GAP * (visible - 1)) / visible);
}

/**
 * Bố cục các cột (`app.md` §2 `KanbanPager`).
 *  · Điện thoại: pager ngang, mỗi cột 88 % bề rộng (lộ mép cột kế bên), snap theo
 *    cột, kèm chỉ báo "Cột 2/4 · Đang làm" — vuốt ngang chuyển cột, thả thẻ giữa
 *    cột nhờ tự lật ở mép hoặc `MoveTaskSheet`.
 *  · Tablet: dải cột cuộn ngang, 3–4 cột thấy cùng lúc, kéo giữa cột trực tiếp.
 *
 * Bề rộng cột TÍNH từ `useBreakpoint().width`, không viết cứng dp (`responsive.md`
 * điều 2): số của Figma là trên khung 375.
 */
export function KanbanPager({ columns, hasMore, tasks, ...rest }: KanbanBoardProps) {
  const { isTablet, tier, width } = useBreakpoint();
  const drag = useDrag();
  const registerPager = drag?.registerPager;
  const scrollRef = useRef<ScrollView>(null);
  const offsetX = useRef(0);
  const contentWidth = useRef(0);
  const [areaHeight, setAreaHeight] = useState(0);
  const [page, setPage] = useState(0);

  const columnWidth = isTablet
    ? tabletColumnWidth(width, tier === 'tablet-lg' ? 4 : 3)
    : Math.round(width * PHONE_PAGE_WIDTH_RATIO);
  const step = columnWidth + COLUMN_GAP;

  useEffect(() => {
    registerPager?.({
      getOffsetX: () => offsetX.current,
      scrollBy: (dx) => {
        const max = Math.max(0, contentWidth.current - width);
        const next = Math.min(max, Math.max(0, offsetX.current + dx));
        offsetX.current = next;
        scrollRef.current?.scrollTo({ animated: false, x: next });
      },
      // Điện thoại: về cột gần nhất sau khi kéo (tự cuộn dừng ở độ lệch bất kỳ). Tablet cuộn tự do, không có trang để về.
      settle: () => {
        if (isTablet) return;
        scrollRef.current?.scrollTo({ animated: true, x: Math.round(offsetX.current / step) * step });
      },
    });
    return () => registerPager?.(null);
  }, [isTablet, registerPager, step, width]);

  const activeIndex = Math.min(page, Math.max(0, columns.length - 1));
  const active = columns[activeIndex];

  return (
    <View className="flex-1">
      {!isTablet && active ? (
        <View accessibilityLiveRegion="polite" className="items-center gap-3xs pb-xs">
          <Text className="text-label-md text-fg-2">{`Cột ${activeIndex + 1}/${columns.length} · ${active.title}`}</Text>
          <SliderDot
            activeIndex={activeIndex}
            count={columns.length}
            onPressDot={(index) => scrollRef.current?.scrollTo({ animated: true, x: index * step })}
          />
        </View>
      ) : null}

      <View className="flex-1" onLayout={(event) => setAreaHeight(event.nativeEvent.layout.height)}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ gap: COLUMN_GAP, paddingHorizontal: SPACING.md }}
          decelerationRate="fast"
          horizontal
          // ⛔ Thiếu thì ô "Thêm thẻ" đang gõ (bàn phím mở) bấm "Thêm"/"Đóng" lần đầu chỉ ĐÓNG bàn phím, nút không chạy — mặc định
          // `never` của ScrollView nuốt cú chạm. `handled`: nút xử lý được thì nút nhận; chạm chỗ trống vẫn đóng bàn phím.
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!drag?.session}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={isTablet ? undefined : step}
          onContentSizeChange={(contentW) => {
            contentWidth.current = contentW;
          }}
          onScroll={(event) => {
            offsetX.current = event.nativeEvent.contentOffset.x;
            const next = Math.round(offsetX.current / step);
            if (next !== page) setPage(next);
          }}
        >
          {areaHeight > 0
            ? columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  {...rest}
                  column={column}
                  hasMore={hasMore[column.id] ?? false}
                  height={areaHeight}
                  tasks={tasks[column.id] ?? []}
                  width={columnWidth}
                />
              ))
            : null}
        </ScrollView>
      </View>
    </View>
  );
}
