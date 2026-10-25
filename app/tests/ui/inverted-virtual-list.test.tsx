import { act, render, renderHook } from '@testing-library/react-native';
import { createRef, type Ref } from 'react';
import { Text } from 'react-native';

import {
  InvertedVirtualList,
  useStickyBottom,
  type InvertedVirtualListHandle,
} from '@/shared/ui/virtual-list';

/**
 * `InvertedVirtualList` + `useStickyBottom` (p0-12, TX-07). `FlashList` được thay bằng một giả CHỤP props và handler: Jest không có bố
 * cục thật, nên test kiểm CÁCH DANH SÁCH ĐƯỢC CẤU HÌNH (không `inverted`, `startRenderingFromBottom`, tải cũ/mới đúng điều kiện, cờ
 * "rời đáy" chỉ bắn khi đổi) — vị trí cuộn thật là việc đo trên thiết bị (SHL-06). `render()` của RNTL 14 phải `await`.
 */
type Captured = Record<string, unknown> & {
  maintainVisibleContentPosition?: {
    autoscrollToBottomThreshold?: number;
    startRenderingFromBottom?: boolean;
  };
  onEndReached: () => void;
  onScroll: (event: unknown) => void;
  onStartReached: () => void;
};

const mockScrollToEnd = jest.fn();
let mockCaptured: Captured | undefined;

jest.mock('@shopify/flash-list', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: forwardRef((props: Captured, ref: Ref<unknown>) => {
      mockCaptured = props;
      useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
      return <View testID="flash-list" />;
    }),
  };
});

const ITEMS = [{ id: 'a' }, { id: 'b' }];
const scrollEvent = (offsetY: number, contentHeight = 1000, viewHeight = 500) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { height: contentHeight, width: 300 },
    layoutMeasurement: { height: viewHeight, width: 300 },
  },
});

function renderList(
  props: Partial<React.ComponentProps<typeof InvertedVirtualList<{ id: string }>>> = {},
) {
  return render(
    <InvertedVirtualList
      data={ITEMS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <Text>{item.id}</Text>}
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCaptured = undefined;
});

describe('InvertedVirtualList — cấu hình FlashList 2', () => {
  it('KHÔNG `inverted`; mở ở ĐÁY và tự bám đáy khi người dùng đang gần đáy', async () => {
    await renderList();

    expect(mockCaptured).toBeDefined();
    expect(mockCaptured).not.toHaveProperty('inverted');
    expect(mockCaptured?.maintainVisibleContentPosition).toEqual({
      autoscrollToBottomThreshold: 0.2,
      startRenderingFromBottom: true,
    });
  });

  it('chuyển data/keyExtractor xuống danh sách', async () => {
    await renderList();

    expect(mockCaptured?.data).toBe(ITEMS);
  });
});

describe('InvertedVirtualList — tải cũ hơn / mới hơn', () => {
  it('chạm ĐẦU ⇒ onLoadOlder khi còn trang cũ và chưa đang tải', async () => {
    const onLoadOlder = jest.fn();
    await renderList({ hasOlder: true, onLoadOlder });

    mockCaptured?.onStartReached();

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['hết trang cũ', { hasOlder: false }],
    ['đang tải trang cũ', { hasOlder: true, isFetchingOlder: true }],
  ])('%s ⇒ KHÔNG gọi onLoadOlder (chống tải chồng)', async (_name, props) => {
    const onLoadOlder = jest.fn();
    await renderList({ ...props, onLoadOlder });

    mockCaptured?.onStartReached();

    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('chạm CUỐI ⇒ onLoadNewer chỉ khi còn trang mới và chưa đang tải', async () => {
    const onLoadNewer = jest.fn();
    const screen = await renderList({ hasNewer: true, onLoadNewer });
    mockCaptured?.onEndReached();
    expect(onLoadNewer).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <InvertedVirtualList
        data={ITEMS}
        hasNewer
        isFetchingNewer
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        onLoadNewer={onLoadNewer}
      />,
    );
    mockCaptured?.onEndReached();
    expect(onLoadNewer).toHaveBeenCalledTimes(1);
  });

  it('callback tải đọc trạng thái MỚI NHẤT (FlashList giữ callback từ lúc mount)', async () => {
    const onLoadOlder = jest.fn();
    const screen = await renderList({ hasOlder: false, onLoadOlder });
    const staleHandler = mockCaptured?.onStartReached;

    await screen.rerender(
      <InvertedVirtualList
        data={ITEMS}
        hasOlder
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        onLoadOlder={onLoadOlder}
      />,
    );
    staleHandler?.();

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });
});

describe('InvertedVirtualList — rời đáy & cuộn xuống đáy', () => {
  it('onScrollAwayFromBottom chỉ bắn khi cờ ĐỔI (không mỗi sự kiện cuộn)', async () => {
    const onAway = jest.fn();
    await renderList({ onScrollAwayFromBottom: onAway });

    await act(async () => mockCaptured?.onScroll(scrollEvent(500))); // sát đáy (1000 − 500 − 500 = 0)
    await act(async () => mockCaptured?.onScroll(scrollEvent(100))); // cuộn LÊN đọc tin cũ (cách đáy 400dp)
    await act(async () => mockCaptured?.onScroll(scrollEvent(120)));
    await act(async () => mockCaptured?.onScroll(scrollEvent(500))); // quay lại đáy

    expect(onAway.mock.calls).toEqual([[true], [false]]);
  });

  it('tay cầm scrollToBottom gọi scrollToEnd (có/không hiệu ứng)', async () => {
    const handle = createRef<InvertedVirtualListHandle>();
    await renderList({ handleRef: handle });

    handle.current?.scrollToBottom();
    handle.current?.scrollToBottom(false);

    expect(mockScrollToEnd.mock.calls).toEqual([[{ animated: true }], [{ animated: false }]]);
  });
});

describe('useStickyBottom', () => {
  it('cách đáy > ngưỡng ⇒ awayFromBottom=true; về gần đáy (≤ ngưỡng) ⇒ false', async () => {
    const { result } = await renderHook(() => useStickyBottom({ threshold: 80 }));
    expect(result.current.awayFromBottom).toBe(false);

    await act(async () => result.current.onScroll(scrollEvent(419) as never)); // cách đáy 81
    expect(result.current.awayFromBottom).toBe(true);

    await act(async () => result.current.onScroll(scrollEvent(420) as never)); // cách đáy đúng 80
    expect(result.current.awayFromBottom).toBe(false);
  });

  it('nội dung ngắn hơn khung nhìn (âm) không bao giờ là "rời đáy"', async () => {
    const { result } = await renderHook(() => useStickyBottom());

    await act(async () => result.current.onScroll(scrollEvent(0, 200, 500) as never));

    expect(result.current.awayFromBottom).toBe(false);
  });
});
