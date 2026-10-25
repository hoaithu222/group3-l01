import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { act, renderHook } from '@testing-library/react-native';

import { __resetNetworkStateForTests } from '@/core/net/network-state';
import { useNetworkStatus } from '@/shared/hooks/use-network-status';

/**
 * `useNetworkStatus` (p0-12, SHL-05): trạng thái mạng cho giao diện, MỘT đăng ký NetInfo cho mọi nơi dùng,
 * `isOnline` là `true` cho tới khi NetInfo báo chắc chắn ngược lại.
 */

const mockedNetInfo = jest.mocked(NetInfo);
let emit: (state: object) => void = () => undefined;

const OFFLINE = { details: null, isConnected: false, isInternetReachable: false, type: 'none' };
const WIFI = {
  details: { isConnectionExpensive: false },
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};
const CELLULAR = {
  details: { isConnectionExpensive: true },
  isConnected: true,
  isInternetReachable: true,
  type: 'cellular',
};

beforeEach(() => {
  __resetNetworkStateForTests();
  mockedNetInfo.addEventListener.mockReset();
  mockedNetInfo.addEventListener.mockImplementation((listener) => {
    emit = (state) => listener(state as NetInfoState);
    return jest.fn();
  });
});

describe('useNetworkStatus', () => {
  it('mặc định online (chưa biết ≠ ngoại tuyến — không nháy banner lúc mở app)', async () => {
    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current).toMatchObject({ isOnline: true, isMetered: false });
  });

  it('mất mạng ⇒ isOnline=false; có lại ⇒ true', async () => {
    const { result } = await renderHook(() => useNetworkStatus());

    await act(async () => emit(OFFLINE));
    expect(result.current).toMatchObject({
      isInternetReachable: false,
      isOnline: false,
      type: 'none',
    });

    await act(async () => emit(WIFI));
    expect(result.current).toMatchObject({ isOnline: true, type: 'wifi' });
  });

  it('dữ liệu di động tính phí → isMetered', async () => {
    const { result } = await renderHook(() => useNetworkStatus());

    await act(async () => emit(CELLULAR));

    expect(result.current).toMatchObject({ isMetered: true, type: 'cellular' });
  });

  it('nhiều hook cùng lúc dùng chung MỘT đăng ký NetInfo', async () => {
    await renderHook(() => useNetworkStatus());
    await renderHook(() => useNetworkStatus());
    await renderHook(() => useNetworkStatus());

    expect(mockedNetInfo.addEventListener).toHaveBeenCalledTimes(1);
  });
});
