import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { RoomPerson } from '../../utils/room-people.utils';
import { GridPage } from './GridPage';
import type { RenderVideo } from './stage.types';

export interface GridPagerProps {
  /** Thứ tự giơ tay của CẢ phòng — `MeetingStage` tính một lần, mọi trang dùng chung (số trên ô không đánh lại theo trang). */
  handOrder?: ReadonlyMap<string, number>;
  landscape: boolean;
  /** Người dùng vuốt xong tới trang mới (0-based). Cha ghi vào store và đổi danh sách video được subscribe. */
  onChangePage: (page: number) => void;
  onLongPressTile: (userId: string) => void;
  /** Trang đang xem (0-based). Cha đổi (kẹp lại khi số trang giảm) thì danh sách cuộn theo, không hoạt ảnh. */
  page: number;
  /** Mỗi phần tử là người của MỘT trang (`paginate(people, pageSize)`). */
  pages: RoomPerson[][];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
}

interface Size {
  height: number;
  width: number;
}

/**
 * Các trang lưới vuốt NGANG (`pagingEnabled`): chỉ TRANG đang xem cần video — cha đọc `page` để `setVideoSubscriptions` (app.md §6 "Subscribe").
 *
 * ⚠️ Bề rộng trang lấy từ `onLayout` của chính khung (điện thoại xoay ngang có cột điều khiển bên phải nên khung hẹp hơn cửa sổ), rơi về
 * `useWindowDimensions` cho tới khi có phép đo đầu tiên — không có phép đo thì khung hình đầu trống. ⛔ Không `Dimensions.get`: xoay máy là kẹt.
 * Bề rộng đổi (xoay) ⇒ cuộn lại đúng trang hiện tại, nếu không danh sách kẹt ở offset px cũ và nửa trang này dính nửa trang kia.
 * ✅ Phép đo CÙNG kích thước thì giữ nguyên object cũ: `onLayout` bắn lại mỗi lần cha dựng lại khung — tạo object mới là vẽ lại cả lưới vô ích.
 */
export function GridPager({ handOrder, landscape, onChangePage, onLongPressTile, page, pages, pinnedUserId, renderVideo }: GridPagerProps) {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<Size | null>(null);
  const listRef = useRef<FlatList<RoomPerson[]>>(null);
  const width = measured?.width ?? window.width;
  const height = measured?.height ?? window.height;

  useEffect(() => {
    if (width > 0) listRef.current?.scrollToOffset({ animated: false, offset: page * width });
  }, [page, width]);

  const onMeasured = (event: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = event.nativeEvent.layout;
    setMeasured((prev) => (prev?.height === nextHeight && prev.width === nextWidth ? prev : { height: nextHeight, width: nextWidth }));
  };
  const onSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== page) onChangePage(next);
  };

  return (
    <View className="flex-1 overflow-hidden" testID="grid-pager-frame" onLayout={onMeasured}>
      <FlatList
        ref={listRef}
        data={pages}
        getItemLayout={(_data, index) => ({ index, length: width, offset: width * index })}
        horizontal
        initialScrollIndex={Math.min(page, Math.max(pages.length - 1, 0))}
        keyExtractor={(_page, index) => String(index)}
        pagingEnabled
        renderItem={({ index, item }) => (
          <View style={{ height, width }} testID={`grid-page-${String(index)}`}>
            <GridPage
              handOrder={handOrder}
              landscape={landscape}
              people={item}
              pinnedUserId={pinnedUserId}
              renderVideo={renderVideo}
              onLongPressTile={onLongPressTile}
            />
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        testID="grid-pager"
        onMomentumScrollEnd={onSettled}
      />
    </View>
  );
}
