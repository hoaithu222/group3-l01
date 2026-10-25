import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useThemeColors } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import type { Heatmap } from '../api/contribution.types';
import { HEAT_CELL, HEAT_STEP, HEAT_TOKENS, HEAT_WEEKDAY_LABELS } from '../constants/contribution.constants';
import { buildHeatmapGrid, dayDetailText, heatmapSummary, type HeatmapRange } from '../utils/heatmap-grid';
import { HeatmapLegend } from './HeatmapLegend';

export interface ActivityHeatmapProps {
  data: Heatmap | undefined;
  error: unknown;
  loading: boolean;
  range: HeatmapRange | null;
  weeks: number;
  onOpenList: () => void;
  onRetry: () => void;
}

/**
 * Biểu đồ hoạt động theo NGÀY (app.md §3 `ActivityHeatmap`, `react-native-svg` — không thêm thư viện chart): lưới 7 hàng (thứ Hai ở trên) × 26 tuần
 * (máy tính bảng 52), 5 mức màu theo phân vị. Điện thoại cuộn ngang và dừng ở tuần MỚI NHẤT.
 *
 * Trợ năng (màu không phải tín hiệu duy nhất): SVG là trang trí (ẩn khỏi trình đọc màn hình); cả khối có TÓM TẮT chữ "42 ngày có hoạt động trong 26 tuần,
 * nhiều nhất 15/09 (12)", chú giải "Ít → Nhiều", và "Xem danh sách theo ngày" là bản chữ của lưới. Chạm lưới chọn ô GẦN NHẤT (một `Pressable` phủ cả
 * lưới — chạm trượt vài dp vẫn trúng ô, thay vì 182 vùng chạm 13dp) rồi hiện chi tiết ngày dưới lưới.
 *
 * Riêng tư: server chỉ trả NGÀY + số đếm — không giờ, không id thẻ — nên biểu đồ không lộ nhịp làm việc trong ngày.
 */
export function ActivityHeatmap({ data, error, loading, range, weeks, onOpenList, onRetry }: ActivityHeatmapProps) {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo(() => (range && data ? buildHeatmapGrid(range, weeks, data.days) : []), [data, range, weeks]);
  const byDate = useMemo(() => new Map((data?.days ?? []).map((day) => [day.date, day])), [data]);

  if (!range || (loading && !data)) return <Skeleton className="h-36 rounded-xs" />;
  if (!data) {
    return (
      <Alert
        actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={onRetry} />}
        description={toErrorMessage(error)}
        title="Không tải được biểu đồ hoạt động"
        tone="error"
      />
    );
  }
  if (data.maxTotal === 0) {
    return (
      <EmptyState
        description="Hoạt động của thẻ, bình luận và lượt chấm sẽ hiện ở đây."
        icon="chart-1"
        size="compact"
        title="Chưa có hoạt động"
      />
    );
  }

  const summary = heatmapSummary(data.days, weeks);
  const width = columns.length * HEAT_STEP - (HEAT_STEP - HEAT_CELL);
  const height = 7 * HEAT_STEP - (HEAT_STEP - HEAT_CELL);

  const pick = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const cell = columns[Math.floor(locationX / HEAT_STEP)]?.cells[Math.floor(locationY / HEAT_STEP)];
    if (cell && !cell.future) setSelected(cell.date);
  };

  return (
    <View className="gap-sm">
      <Text className="text-body-md text-fg-1">{summary}</Text>
      <View className="flex-row gap-xs">
        <View className="pt-md">
          {HEAT_WEEKDAY_LABELS.map((label, row) => (
            <View key={label ?? `row-${row}`} className="justify-center" style={{ height: HEAT_STEP }}>
              <Text className="text-label-xs text-fg-2">{label ?? ''}</Text>
            </View>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View>
            <View className="h-md" style={{ width }}>
              {columns.map((column, index) =>
                column.monthLabel ? (
                  <Text key={column.cells[0]?.date} className="absolute text-label-xs text-fg-2" numberOfLines={1} style={{ left: index * HEAT_STEP }}>
                    {column.monthLabel}
                  </Text>
                ) : null,
              )}
            </View>
            <Pressable accessibilityLabel={`${summary}. Chạm để xem một ngày.`} accessibilityRole="image" onPress={pick}>
              <Svg accessibilityElementsHidden height={height} importantForAccessibility="no-hide-descendants" pointerEvents="none" width={width}>
                {columns.map((column, x) =>
                  column.cells.map((cell, y) =>
                    cell.future ? null : (
                      <Rect
                        key={cell.date}
                        fill={colors[HEAT_TOKENS[cell.level]]}
                        height={HEAT_CELL}
                        rx={2}
                        stroke={cell.date === selected ? colors['fg-1'] : undefined}
                        strokeWidth={cell.date === selected ? 2 : 0}
                        width={HEAT_CELL}
                        x={x * HEAT_STEP}
                        y={y * HEAT_STEP}
                      />
                    ),
                  ),
                )}
              </Svg>
            </Pressable>
          </View>
        </ScrollView>
      </View>
      <HeatmapLegend />
      <Text accessibilityLiveRegion="polite" className="min-h-[20px] text-body-md text-fg-1">
        {selected ? dayDetailText(selected, byDate.get(selected)) : 'Chạm vào một ô để xem chi tiết ngày.'}
      </Text>
      <View className="items-start">
        <LinkButton label="Xem danh sách theo ngày" onPress={onOpenList} />
      </View>
    </View>
  );
}
