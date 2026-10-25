import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { RoadmapMediaDto } from '../../api/roadmap.types';
import { ZoomableSvg } from './ZoomableSvg';

export interface SvgViewerProps {
  description: string | null;
  /** Vị trí hình trong buổi (0-based) và tổng số hình — hiện "2/4" + nút chuyển hình. */
  index: number;
  media: RoadmapMediaDto & { svg: string };
  title: string;
  total: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

interface Stage {
  height: number;
  width: number;
}

/** Khoảng hở dưới thanh trạng thái cho hàng Đóng/bộ đếm — cùng nhịp `STATUS_BAR_GAP` của `AppBar`. */
const TOP_GAP = SPACING.xs;
/** Lề ngang/đáy — `px-md` của lưới màn, cộng thêm vùng an toàn ở nơi dùng. */
const EDGE = SPACING.md;

/**
 * Trình xem MỘT mockup SVG toàn màn: bộ đếm + nút Đóng · khung phóng to (`ZoomableSvg`) · tiêu đề/mô tả lấy từ bài ·
 * "Hình trước / Hình sau" để xem lần lượt mọi hình của buổi mà không phải đóng ra mở lại từng hình.
 *
 * ⚠️ Khung phóng to đo bằng `onLayout` (phần còn lại giữa hai thanh), không bằng kích thước cửa sổ: mô tả dài 3 dòng
 * hay không có nút chuyển hình thì chỗ cho hình khác nhau — lấy cả cửa sổ là hình tràn xuống dưới chữ.
 */
export function SvgViewer({
  description,
  index,
  media,
  onClose,
  onNext,
  onPrev,
  title,
  total,
}: SvgViewerProps) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage | null>(null);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setStage((current) =>
      current && current.height === height && current.width === width ? current : { height, width },
    );
  };

  return (
    // ⛔ `bg-black` không sinh class — `ink-10` là bậc gần đen nhất của thang màu (giống nhau ở hai chế độ).
    <View accessibilityViewIsModal className="flex-1 bg-ink-10">
      {/* ⚠️ Lề ngang = 16 + vùng an toàn trái/phải (xoay ngang: tai thỏ ăn mất nút Đóng) — đặt bằng `style` vì style ĐÈ
          class chứ không cộng, `px-md` cạnh đó sẽ vô tác dụng. */}
      <View
        className="flex-row items-center justify-between pb-xs"
        style={{
          paddingLeft: insets.left + EDGE,
          paddingRight: insets.right + EDGE,
          paddingTop: insets.top + TOP_GAP,
        }}
      >
        <Text className="text-label-md font-semibold text-white-10">
          {total > 1 ? `${String(index + 1)}/${String(total)}` : ''}
        </Text>
        <Pressable
          accessibilityLabel="Đóng"
          accessibilityRole="button"
          className="active:opacity-70"
          hitSlop={12}
          onPress={onClose}
        >
          <Icon color="white-10" name="cancel" size={28} />
        </Pressable>
      </View>

      <View className="flex-1" onLayout={handleLayout}>
        {stage ? (
          <ZoomableSvg
            key={media.id}
            accessibilityLabel={description ? `${title}. ${description}` : title}
            boxHeight={stage.height}
            boxWidth={stage.width}
            svg={media.svg}
            svgHeight={media.height}
            svgWidth={media.width}
          />
        ) : null}
      </View>

      <View
        className="gap-sm pt-sm"
        style={{
          paddingBottom: Math.max(insets.bottom, EDGE),
          paddingLeft: insets.left + EDGE,
          paddingRight: insets.right + EDGE,
        }}
      >
        <View className="gap-3xs">
          <Text className="text-label-lg font-semibold text-white-10">{title}</Text>
          {description ? (
            <Text className="text-body-md text-white-8" numberOfLines={3}>
              {description}
            </Text>
          ) : null}
          <Text className="text-caption-sm text-white-8">
            Chụm hai ngón hoặc chạm đúp để phóng to
          </Text>
        </View>
        {total > 1 ? (
          <View className="flex-row gap-sm">
            <View className="flex-1">
              <Button
                disabled={!onPrev}
                fullWidth
                iconLeft="arrow-left"
                label="Hình trước"
                size="sm"
                variant="white-secondary"
                onPress={onPrev}
              />
            </View>
            <View className="flex-1">
              <Button
                disabled={!onNext}
                fullWidth
                iconRight="arrow-right"
                label="Hình sau"
                size="sm"
                variant="white-secondary"
                onPress={onNext}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
