import { fireEvent, render } from '@testing-library/react-native';
import { type ReactElement, type ReactNode } from 'react';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MediaViewer, type MediaViewerItem } from '@/shared/ui/media-viewer';
import { ViewerVideo } from '@/shared/ui/media-viewer/ViewerVideo';

/**
 * `MediaViewer` (p0-12): trình xem ảnh/video toàn màn, vuốt ngang giữa các tệp. Jest không có cử chỉ pinch/pan nên phần ZOOM chỉ kiểm
 * bằng số học thuần (`media-viewer-zoom.test.ts`) — ở đây kiểm PHÂN TRANG, nút Đóng/Chia sẻ, nhãn trợ năng, video không tự phát, danh
 * sách rỗng. `render()` của RNTL 14 phải `await`, `fireEvent.*` cũng vậy.
 */
const mockPause = jest.fn();
const mockPlay = jest.fn();
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ pause: mockPause, play: mockPlay }),
  VideoView: () => null,
}));

/** RNGH báo "callbacks are worklets and some are not" mỗi lần dựng `GestureDetector` TRONG JEST (nạp bản lib đã biên dịch) — lọc đúng câu đó. */
const realConsoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('[react-native-gesture-handler]')) return;
    realConsoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);
const show = (ui: ReactElement) => render(ui, { wrapper: Wrapper });

const ITEMS: MediaViewerItem[] = [
  { type: 'image', uri: 'https://cdn.example/a.jpg' },
  { accessibilityLabel: 'Sơ đồ tầng 3', type: 'image', uri: 'https://cdn.example/b.jpg' },
  { type: 'video', uri: 'https://cdn.example/c.mp4' },
];
/** `useWindowDimensions().width` trong Jest — độ lệch cuộn của một trang đúng bằng nó. */
const PAGE = Dimensions.get('window').width;

beforeEach(() => jest.clearAllMocks());

describe('MediaViewer — phân trang', () => {
  it('mở ở trang đầu: bộ đếm "1/3", nhãn trang "Ảnh 1/3"', async () => {
    const screen = await show(<MediaViewer items={ITEMS} onClose={jest.fn()} />);

    expect(screen.getByText('1/3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ảnh 1/3')).toBeOnTheScreen();
  });

  it('initialIndex được dùng (và kẹp vào [0, số tệp − 1])', async () => {
    const third = await show(<MediaViewer initialIndex={2} items={ITEMS} onClose={jest.fn()} />);
    expect(third.getByText('3/3')).toBeOnTheScreen();

    const clamped = await show(<MediaViewer initialIndex={99} items={ITEMS} onClose={jest.fn()} />);
    expect(clamped.getByText('3/3')).toBeOnTheScreen();

    const negative = await show(
      <MediaViewer initialIndex={-5} items={ITEMS} onClose={jest.fn()} />,
    );
    expect(negative.getByText('1/3')).toBeOnTheScreen();
  });

  it('vuốt sang trang khác: bộ đếm đổi và onIndexChange báo đúng chỉ số', async () => {
    const onIndexChange = jest.fn();
    const screen = await show(
      <MediaViewer items={ITEMS} onClose={jest.fn()} onIndexChange={onIndexChange} />,
    );

    await fireEvent(screen.getByTestId('media-viewer-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: PAGE, y: 0 } },
    });

    expect(screen.getByText('2/3')).toBeOnTheScreen();
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('cuộn dừng ở CHÍNH trang đang xem thì không báo lại', async () => {
    const onIndexChange = jest.fn();
    const screen = await show(
      <MediaViewer items={ITEMS} onClose={jest.fn()} onIndexChange={onIndexChange} />,
    );

    await fireEvent(screen.getByTestId('media-viewer-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('nhãn riêng của tệp được ưu tiên hơn nhãn mặc định', async () => {
    const screen = await show(<MediaViewer initialIndex={1} items={ITEMS} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Sơ đồ tầng 3')).toBeOnTheScreen();
  });

  it('chỉ MỘT tệp ⇒ không hiện bộ đếm', async () => {
    const screen = await show(
      <MediaViewer items={[ITEMS[0] as MediaViewerItem]} onClose={jest.fn()} />,
    );

    expect(screen.queryByText('1/1')).toBeNull();
  });
});

describe('MediaViewer — nút', () => {
  it('Đóng có nhãn và gọi onClose', async () => {
    const onClose = jest.fn();
    const screen = await show(<MediaViewer items={ITEMS} onClose={onClose} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Chia sẻ chỉ có khi truyền onShare, và gửi ĐÚNG tệp đang xem', async () => {
    const onShare = jest.fn();
    const without = await show(<MediaViewer items={ITEMS} onClose={jest.fn()} />);
    expect(without.queryByRole('button', { name: 'Chia sẻ' })).toBeNull();

    const screen = await show(
      <MediaViewer initialIndex={1} items={ITEMS} onClose={jest.fn()} onShare={onShare} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ' }));

    expect(onShare).toHaveBeenCalledWith(ITEMS[1]);
  });
});

describe('MediaViewer — danh sách rỗng', () => {
  it('KHÔNG phải màn đen trống: có chữ nói chuyện gì đang xảy ra và nút Đóng để thoát', async () => {
    const onClose = jest.fn();
    const screen = await show(<MediaViewer items={[]} onClose={onClose} />);

    expect(screen.getByText('Không có tệp nào để xem')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ViewerVideo — không tự phát', () => {
  it('trang đang xem KHÔNG bị tạm dừng, và KHÔNG BAO GIỜ gọi play() (video có tiếng không tự bật)', async () => {
    await render(<ViewerVideo active height={800} uri="https://cdn.example/c.mp4" width={400} />);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('rời trang (active=false) ⇒ tạm dừng — không để tiếng phát tiếp ở trang khuất', async () => {
    const screen = await render(
      <ViewerVideo active height={800} uri="https://cdn.example/c.mp4" width={400} />,
    );

    await screen.rerender(
      <ViewerVideo active={false} height={800} uri="https://cdn.example/c.mp4" width={400} />,
    );

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
