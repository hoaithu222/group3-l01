import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { act, render } from '@testing-library/react-native';

import { __resetNetworkStateForTests } from '@/core/net/network-state';
import { OfflineBanner } from '@/shared/ui/offline-banner';

/**
 * `OfflineBanner` (p0-12, SHL-05): tự đọc `useNetworkStatus()` — hiện khi NetInfo xác nhận mất mạng, ẩn khi có lại. Mock NetInfo ở
 * `jest.setup.js` không tự bắn sự kiện nên test bắn qua listener bắt được. `render()` của RNTL 14 phải `await`.
 */
const mockedNetInfo = jest.mocked(NetInfo);
let emit: (state: object) => void = () => undefined;

beforeEach(() => {
  __resetNetworkStateForTests();
  mockedNetInfo.addEventListener.mockReset();
  mockedNetInfo.addEventListener.mockImplementation((listener) => {
    emit = (state) => listener(state as NetInfoState);
    return jest.fn();
  });
});

const OFFLINE = { details: null, isConnected: false, isInternetReachable: false, type: 'none' };
const WIFI = { details: null, isConnected: true, isInternetReachable: true, type: 'wifi' };

describe('OfflineBanner', () => {
  it('online (hoặc chưa biết) ⇒ KHÔNG hiện, không chiếm chỗ', async () => {
    const screen = await render(<OfflineBanner />);

    expect(screen.queryByText('Bạn đang ngoại tuyến')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('mất mạng ⇒ hiện "Bạn đang ngoại tuyến"; có lại ⇒ ẩn', async () => {
    const screen = await render(<OfflineBanner />);

    await act(async () => emit(OFFLINE));
    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();

    await act(async () => emit(WIFI));
    expect(screen.queryByText('Bạn đang ngoại tuyến')).toBeNull();
  });

  it('là vùng thông báo (role alert, tông lỗi) để trình đọc màn hình đọc ra ngay khi xuất hiện', async () => {
    const screen = await render(<OfflineBanner />);

    await act(async () => emit(OFFLINE));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('câu ghi đè được', async () => {
    const screen = await render(<OfflineBanner message="Cần kết nối để tìm" />);

    await act(async () => emit(OFFLINE));

    expect(screen.getByText('Cần kết nối để tìm')).toBeOnTheScreen();
    expect(screen.queryByText('Bạn đang ngoại tuyến')).toBeNull();
  });
});
