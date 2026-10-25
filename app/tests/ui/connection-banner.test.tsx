import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets, type Metrics } from 'react-native-safe-area-context';

import { useConnectionState } from '@/core/socket/use-connection-state';
import { ConnectionBanner } from '@/shared/ui/connection-banner';

/**
 * `ConnectionBanner` — chỉ test HÀNH VI TIMING của chính component (trễ 3s cho
 * `connecting`, hiện ngay cho `offline`), KHÔNG re-test logic bên trong
 * `useConnectionState()` (đã là một hook riêng, không thuộc phạm vi test này).
 * Mock hẳn hook để điều khiển trạng thái CHÍNH XÁC từng ca mà không phải dựng
 * lại cả NetInfo lẫn socket.
 */
jest.mock('@/core/socket/use-connection-state', () => ({
  useConnectionState: jest.fn(),
}));

/** Số đo máy có tai thỏ: `insets.top = 44` — đúng ca banner phải né thanh trạng thái. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

/** Đọc `insets.top` mà phần nằm dưới banner nhìn thấy. */
function InsetProbe() {
  return <Text>{`top=${String(useSafeAreaInsets().top)}`}</Text>;
}

const mockedUseConnectionState = useConnectionState as jest.MockedFunction<
  typeof useConnectionState
>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ConnectionBanner', () => {
  it('connected ⇒ không hiện gì', async () => {
    mockedUseConnectionState.mockReturnValue('connected');
    const screen = await render(<ConnectionBanner />);

    expect(screen.queryByText('Đang kết nối lại…')).toBeNull();
    expect(screen.queryByText('Bạn đang ngoại tuyến')).toBeNull();
  });

  it('unauthorized ⇒ không hiện gì (guard đăng xuất tự lo)', async () => {
    mockedUseConnectionState.mockReturnValue('unauthorized');
    const screen = await render(<ConnectionBanner />);

    expect(screen.queryByText('Đang kết nối lại…')).toBeNull();
    expect(screen.queryByText('Bạn đang ngoại tuyến')).toBeNull();
  });

  it('offline ⇒ hiện NGAY, không chờ', async () => {
    mockedUseConnectionState.mockReturnValue('offline');
    const screen = await render(<ConnectionBanner />);

    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
  });

  it('connecting < 3s ⇒ CHƯA hiện; đủ 3s ⇒ hiện', async () => {
    mockedUseConnectionState.mockReturnValue('connecting');
    const screen = await render(<ConnectionBanner />);

    expect(screen.queryByText('Đang kết nối lại…')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Đang kết nối lại…')).toBeOnTheScreen();
  });

  it('connecting rồi offline TRƯỚC khi đủ 3s ⇒ chuyển sang hiện "ngoại tuyến" ngay, không đợi hết 3s', async () => {
    mockedUseConnectionState.mockReturnValue('connecting');
    const screen = await render(<ConnectionBanner />);

    mockedUseConnectionState.mockReturnValue('offline');
    await act(async () => {
      screen.rerender(<ConnectionBanner />);
    });

    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.queryByText('Đang kết nối lại…')).toBeNull();
  });

  /**
   * ⛔ Banner đã né thanh trạng thái (đệm `insets.top`), nên phần bên dưới phải thấy `top = 0` — nếu không `AppBar` cộng vùng
   * an toàn LẦN HAI và trang tụt xuống một khoảng trống dư. Ngược lại khi banner ẩn, `children` phải thấy `insets` thật.
   */
  it('banner HIỆN ⇒ children thấy insets.top = 0', async () => {
    mockedUseConnectionState.mockReturnValue('offline');
    const screen = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ConnectionBanner>
          <InsetProbe />
        </ConnectionBanner>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.getByText('top=0')).toBeOnTheScreen();
  });

  it('banner ẨN ⇒ children vẫn thấy insets.top thật (không nuốt vùng an toàn khi không có banner)', async () => {
    mockedUseConnectionState.mockReturnValue('connected');
    const screen = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ConnectionBanner>
          <InsetProbe />
        </ConnectionBanner>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('top=44')).toBeOnTheScreen();
  });

  it('dùng được NGOÀI SafeAreaProvider (không ném) và vẫn vẽ children', async () => {
    mockedUseConnectionState.mockReturnValue('offline');
    const screen = await render(
      <ConnectionBanner>
        <Text>nội dung</Text>
      </ConnectionBanner>,
    );

    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.getByText('nội dung')).toBeOnTheScreen();
  });
});
