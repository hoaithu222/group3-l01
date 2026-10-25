import { useState } from 'react';
import {
  FlatList,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { tCommon } from '@/shared/utils/i18n';

import type { MediaViewerItem } from './media-viewer.types';
import { MediaViewerToolbar } from './MediaViewerToolbar';
import { ViewerVideo } from './ViewerVideo';
import { ZoomableImage } from './ZoomableImage';

export interface MediaViewerProps {
  /** Trang bắt đầu (kẹp vào [0, số tệp − 1]). */
  initialIndex?: number;
  items: readonly MediaViewerItem[];
  onClose: () => void;
  /** Báo khi trang đổi (để nơi gọi cập nhật tiêu đề/tệp đang chọn). */
  onIndexChange?: (index: number) => void;
  /** Có thì hiện nút "Chia sẻ" cho tệp đang xem. */
  onShare?: (item: MediaViewerItem) => void;
}

/**
 * Trình xem ảnh/video TOÀN MÀN, vuốt ngang giữa các tệp (p0-12). Ảnh: pinch/chạm đúp để phóng, vuốt xuống để đóng (`ZoomableImage`);
 * video: `expo-video` với điều khiển gốc, ⛔ không tự phát (`ViewerVideo`). Là COMPONENT lấp đầy khung cha (`flex-1`) — nơi gọi quyết
 * định đặt trong route riêng (`presentation: 'modal'`) hay `<Modal>`; nó không tự mở cửa sổ và không tự ẩn thanh trạng thái.
 *
 * ```tsx
 * <MediaViewer initialIndex={2} items={files.map((f) => ({ type: f.isVideo ? 'video' : 'image', uri: f.url }))}
 *   onClose={router.back} onShare={(item) => Sharing.shareAsync(item.uri)} />
 * ```
 *
 * Đây là bản DÙNG CHUNG theo URI (feature không import chéo nhau). `features/chat` có `MediaViewerScreen` riêng dựng từ id tệp đính
 * kèm (tải URL ký qua API, lưu về máy) — chưa zoom; chuyển sang bản này khi cần zoom là việc của chat.
 *
 * Trợ năng: mỗi trang có nhãn ("Ảnh 2/5"), bộ đếm "2/5", nút Đóng/Chia sẻ có nhãn cao 44dp; `accessibilityViewIsModal` (iOS) để trình đọc
 * màn hình không lia ra ngoài. Danh sách rỗng ⇒ hiện chữ + nút Đóng, KHÔNG để màn đen trống.
 */
export function MediaViewer({
  initialIndex = 0,
  items,
  onClose,
  onIndexChange,
  onShare,
}: MediaViewerProps) {
  const { height, width } = useWindowDimensions();
  const start = Math.min(Math.max(0, Math.floor(initialIndex)), Math.max(0, items.length - 1));
  const [index, setIndex] = useState(start);
  // Ảnh đang phóng thì khoá cuộn ngang: kéo ngón để xem chỗ khác không được lật sang tệp kế.
  const [zoomed, setZoomed] = useState(false);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      items.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
    );
    if (next === index) return;
    setIndex(next);
    setZoomed(false);
    onIndexChange?.(next);
  };

  const current = items[index];

  return (
    // ⛔ `bg-black` không sinh class — `ink-10` là bậc gần đen nhất của thang màu (giống nhau ở hai chế độ).
    <View accessibilityViewIsModal className="flex-1 bg-ink-10">
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-md">
          <Text className="text-body-md text-white-10">{tCommon('media.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          extraData={{ index, width }}
          getItemLayout={(_, i) => ({ index: i, length: width, offset: width * i })}
          horizontal
          initialNumToRender={1}
          initialScrollIndex={start}
          keyExtractor={(item, i) => `${String(i)}:${item.uri}`}
          pagingEnabled
          renderItem={({ item, index: i }) => {
            const label =
              item.accessibilityLabel ??
              tCommon(item.type === 'video' ? 'media.video' : 'media.image', {
                index: i + 1,
                total: items.length,
              });
            return item.type === 'video' ? (
              <View accessibilityLabel={label} accessible={false}>
                <ViewerVideo active={i === index} height={height} uri={item.uri} width={width} />
              </View>
            ) : (
              <ZoomableImage
                accessibilityLabel={label}
                height={height}
                uri={item.uri}
                width={width}
                onDismiss={onClose}
                onZoomChange={setZoomed}
              />
            );
          }}
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          testID="media-viewer-pager"
          windowSize={3}
          onMomentumScrollEnd={handleScrollEnd}
        />
      )}

      <MediaViewerToolbar
        index={index}
        total={items.length}
        onClose={onClose}
        onShare={onShare && current ? () => onShare(current) : undefined}
      />
    </View>
  );
}
