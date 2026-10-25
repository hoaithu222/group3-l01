import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';

import { useStickyBottom } from './useStickyBottom';

/** Tay cầm điều khiển từ ngoài (nút "Có N tin mới" → cuộn xuống đáy). */
export interface InvertedVirtualListHandle {
  scrollToBottom: (animated?: boolean) => void;
}

export interface InvertedVirtualListProps<T> {
  /** Trong khoảng này (dp) cách đáy thì coi là "đang ở đáy": tin mới tới thì TỰ cuộn xuống. Mặc định 80. */
  bottomThreshold?: number;
  /** Trần bề rộng nội dung (720dp, `max-w-content`) từ `tablet:` (≥ 600dp), canh giữa. Tắt cho danh sách cần tràn hết bề ngang. Mặc định bật. */
  constrained?: boolean;
  data: readonly T[];
  /** Có còn trang mới hơn (ở CUỐI) — chỉ khi đang xem quanh một tin cũ chưa bắt kịp tin mới nhất. */
  hasNewer?: boolean;
  /** Có còn trang cũ hơn (ở ĐẦU danh sách). */
  hasOlder?: boolean;
  /** Đang tải trang mới hơn/cũ hơn — chặn gọi lại và để nơi gọi vẽ chỉ báo qua `footer`/`header`. */
  isFetchingNewer?: boolean;
  isFetchingOlder?: boolean;
  footer?: ReactNode;
  handleRef?: Ref<InvertedVirtualListHandle>;
  header?: ReactNode;
  keyExtractor: (item: T, index: number) => string;
  /** Tải trang mới hơn (chạm cuối). Chỉ gọi khi `hasNewer && !isFetchingNewer`. */
  onLoadNewer?: () => void;
  /** Tải trang cũ hơn (chạm đầu). Chỉ gọi khi `hasOlder && !isFetchingOlder`. */
  onLoadOlder?: () => void;
  /**
   * Báo khi người dùng ROI đáy (`true`) hoặc quay lại đáy (`false`) — màn cha vẽ pill "Có N tin mới" dựa vào đây. Chỉ bắn khi
   * cờ ĐỔI. ⛔ Danh sách KHÔNG tự cuộn khi cờ là `true` (người dùng đang đọc tin cũ, TX-07).
   */
  onScrollAwayFromBottom?: (away: boolean) => void;
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null;
}

/**
 * Danh sách ảo hoá KIỂU CHAT: dữ liệu theo thứ tự thời gian (cũ → mới), mở ra ở ĐÁY, cuộn lên để tải tin cũ mà KHÔNG nhảy vị
 * trí (p0-12; dùng chung chat kênh/hội thoại/thread). Dựng trên `FlashList` 2 (`@shopify/flash-list`).
 *
 * ── Vì sao KHÔNG `inverted` ──────────────────────────────────────────────────────────────────────────────────────────────
 * FlashList 2 đã bỏ prop `inverted`. Cách chuẩn của bản 2 (và là phương án dự phòng mà kế hoạch p0-12 §10 đã nêu): KHÔNG lật,
 * dữ liệu giữ đúng thứ tự thời gian, `maintainVisibleContentPosition.startRenderingFromBottom` canh khung nhìn ở đáy lúc mở,
 * giữ nguyên tin đang đọc khi tin cũ chèn vào ĐẦU (`onStartReached` = tải cũ hơn), và tự bám đáy khi tin mới tới nếu người dùng
 * đang ở gần đáy (`autoscrollToBottomThreshold`). `features/chat` (`MessageList`) đã chạy đúng cơ chế này.
 *
 * ── Không có `estimatedItemSize` ─────────────────────────────────────────────────────────────────────────────────────────
 * FlashList 2 tự đo hàng — prop đó đã bị gỡ khỏi API, nên KHÔNG có ở đây (kế hoạch ghi theo bản 1).
 *
 * ```tsx
 * <InvertedVirtualList
 *   data={messages} keyExtractor={(m) => m.id} renderItem={({ item }) => <Bubble item={item} />}
 *   hasOlder={hasPreviousPage} isFetchingOlder={isFetchingPreviousPage} onLoadOlder={fetchPreviousPage}
 *   onScrollAwayFromBottom={setShowNewPill} handleRef={listHandle}
 * />
 * ```
 *
 * ⚠️ Bề rộng nội dung bị chặn ở `tablet:max-w-content` (720dp) trên máy tính bảng (`constrained`, cùng trần của `Screen`);
 * hàng vẫn đầy bề ngang trên điện thoại.
 */
export function InvertedVirtualList<T>({
  bottomThreshold = 80,
  constrained = true,
  data,
  footer,
  handleRef,
  hasNewer = false,
  hasOlder = false,
  header,
  isFetchingNewer = false,
  isFetchingOlder = false,
  keyExtractor,
  onLoadNewer,
  onLoadOlder,
  onScrollAwayFromBottom,
  renderItem,
}: InvertedVirtualListProps<T>) {
  const listRef = useRef<FlashListRef<T> | null>(null);
  const { onScroll } = useStickyBottom({ onChange: onScrollAwayFromBottom, threshold: bottomThreshold });

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToBottom: (animated = true) => {
        void listRef.current?.scrollToEnd({ animated });
      },
    }),
    [],
  );

  // Callback tải đọc trạng thái MỚI NHẤT qua ref — FlashList giữ callback `onStartReached/onEndReached` từ lúc mount.
  const latest = useRef({ hasNewer, hasOlder, isFetchingNewer, isFetchingOlder, onLoadNewer, onLoadOlder });
  useEffect(() => {
    latest.current = { hasNewer, hasOlder, isFetchingNewer, isFetchingOlder, onLoadNewer, onLoadOlder };
  });

  return (
    <View className={constrained ? 'flex-1 tablet:w-full tablet:max-w-content tablet:self-center' : 'flex-1'}>
      <FlashList<T>
        ref={listRef}
        data={data as T[]}
        keyExtractor={keyExtractor}
        ListFooterComponent={footer ? <>{footer}</> : undefined}
        ListHeaderComponent={header ? <>{header}</> : undefined}
        maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true }}
        renderItem={renderItem}
        scrollEventThrottle={100}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          const s = latest.current;
          if (s.hasNewer && !s.isFetchingNewer) s.onLoadNewer?.();
        }}
        onEndReachedThreshold={0.4}
        onScroll={onScroll}
        onStartReached={() => {
          const s = latest.current;
          if (s.hasOlder && !s.isFetchingOlder) s.onLoadOlder?.();
        }}
        onStartReachedThreshold={0.4}
      />
    </View>
  );
}
