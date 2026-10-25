import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';

import { queryClient } from '@/core/config/query-client';
import {
  __resetNetworkStateForTests,
  getNetworkSnapshot,
  subscribeNetwork,
  toSnapshot,
} from '@/core/net/network-state';
import { __resetOnlineManagerForTests, initOnlineManager } from '@/core/net/online-manager';

/**
 * Nguồn trạng thái mạng dùng chung + cầu nối `onlineManager` của React Query (p0-12 app.md §4 "Online", SHL-05).
 * NetInfo được mock ở `jest.setup.js` (không bắn sự kiện) — test tự bắn qua listener bắt được.
 */

const mockedNetInfo = jest.mocked(NetInfo);
let emit: (state: object) => void = () => undefined;
const unsubscribeNative = jest.fn();

const asState = (state: object) => state as unknown as NetInfoState;
const online = {
  details: { isConnectionExpensive: false },
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};
const offline = { details: null, isConnected: false, isInternetReachable: false, type: 'none' };

beforeEach(() => {
  __resetNetworkStateForTests();
  __resetOnlineManagerForTests();
  unsubscribeNative.mockClear();
  mockedNetInfo.addEventListener.mockReset();
  mockedNetInfo.addEventListener.mockImplementation((listener) => {
    emit = (state) => listener(asState(state));
    return unsubscribeNative;
  });
});

describe('toSnapshot — "có mạng" nghĩa là gì', () => {
  it('chỉ NetInfo xác nhận CHẮC CHẮN không kết nối mới là ngoại tuyến; null (chưa biết) là online', () => {
    expect(toSnapshot(asState(offline)).isOnline).toBe(false);
    expect(toSnapshot(asState({ ...online, isConnected: null })).isOnline).toBe(true);
    expect(toSnapshot(asState(online)).isOnline).toBe(true);
  });

  it('isInternetReachable === false KHÔNG làm máy thành ngoại tuyến (mạng chặn ping Google vẫn vào được BE)', () => {
    expect(toSnapshot(asState({ ...online, isInternetReachable: false }))).toMatchObject({
      isInternetReachable: false,
      isOnline: true,
    });
  });

  it('dữ liệu di động tính phí → isMetered', () => {
    const state = { details: { isConnectionExpensive: true }, isConnected: true, type: 'cellular' };

    expect(toSnapshot(asState(state)).isMetered).toBe(true);
  });
});

describe('subscribeNetwork', () => {
  it('nhiều người nghe chỉ mở MỘT đăng ký NetInfo; người cuối rời đi thì đóng nó', () => {
    const offA = subscribeNetwork(jest.fn());
    const offB = subscribeNetwork(jest.fn());
    expect(mockedNetInfo.addEventListener).toHaveBeenCalledTimes(1);

    offA();
    expect(unsubscribeNative).not.toHaveBeenCalled();
    offB();
    expect(unsubscribeNative).toHaveBeenCalledTimes(1);
  });

  it('phát cho người nghe khi đổi trạng thái; ảnh chụp đổi tham chiếu chỉ khi có thay đổi thật', () => {
    const listener = jest.fn();
    subscribeNetwork(listener);
    const before = getNetworkSnapshot();
    expect(before.isOnline).toBe(true);

    emit(offline);
    const after = getNetworkSnapshot();
    expect(after.isOnline).toBe(false);
    expect(after).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);

    emit(offline); // lặp lại y hệt ⇒ không phát, giữ nguyên tham chiếu
    expect(getNetworkSnapshot()).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);

    emit(online);
    expect(getNetworkSnapshot().isOnline).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('initOnlineManager — cầu nối React Query (SHL-05)', () => {
  it('mất mạng ⇒ onlineManager offline; có lại ⇒ online và phát sự kiện cho refetchOnReconnect', () => {
    initOnlineManager();
    const seen: boolean[] = [];
    const unsubscribe = onlineManager.subscribe((isOnline) => seen.push(isOnline));

    emit(offline);
    expect(onlineManager.isOnline()).toBe(false);
    emit(online);
    expect(onlineManager.isOnline()).toBe(true);

    expect(seen).toEqual([false, true]);
    unsubscribe();
  });

  it('idempotent: gọi nhiều lần không đăng ký NetInfo lần nữa', () => {
    initOnlineManager();
    const calls = mockedNetInfo.addEventListener.mock.calls.length;

    initOnlineManager();
    initOnlineManager();

    expect(mockedNetInfo.addEventListener.mock.calls.length).toBe(calls);
  });

  it('có mạng lại ⇒ query đang được xem và đã cũ được tải lại (refetchOnReconnect)', async () => {
    initOnlineManager();
    const client = new QueryClient({
      defaultOptions: {
        queries: { networkMode: 'always', refetchOnReconnect: true, retry: false, staleTime: 0 },
      },
    });
    client.mount();
    const queryFn = jest.fn().mockResolvedValue('dữ liệu');
    const watcher = new QueryObserver(client, { queryFn, queryKey: ['x'] });
    const stop = watcher.subscribe(() => undefined);
    await watcher.refetch();
    const before = queryFn.mock.calls.length;

    emit(offline);
    emit(online);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryFn.mock.calls.length).toBeGreaterThan(before);
    stop();
    client.unmount();
  });
});

describe('queryClient dùng chung', () => {
  it('networkMode "always": mất mạng thì request vẫn chạy (và hỏng ngay) thay vì treo — hành vi cũ được giữ', () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.networkMode).toBe('always');
    expect(defaults.mutations?.networkMode).toBe('always');
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });
});
