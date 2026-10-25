import { act, renderHook } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import { AppState, type AppStateStatus } from 'react-native';
import { io } from 'socket.io-client';

import type { Capabilities } from '@/core/capabilities';
import { queryClient } from '@/core/config/query-client';
import { SocketEvent } from '@/core/socket';
import { CAPABILITIES_QUERY_KEY, useConfigSync } from '@/shell/capabilities';

/**
 * p0-07 `app.md` §8 (CFG-10): `config:updated` khác version → làm mới, cùng version → không; foreground sau ≥ 60 s ở nền →
 * làm mới, 10 s → không; socket nối lại (không tính lần đầu); `CFG_005` → làm mới tối đa một lần/30 s.
 */

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}

const CAPS = {
  configVersion: 'v1',
  features: {},
  limits: {},
  upload: {},
  version: '1',
} as unknown as Capabilities;
const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

let appStateListener: ((state: AppStateStatus) => void) | undefined;
jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
  appStateListener = listener as (state: AppStateStatus) => void;
  return { remove: jest.fn() } as never;
});

function emit(event: string, payload?: unknown) {
  const socket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;
  return act(async () => socket.__emitServer(event, payload));
}

const refreshed = () =>
  invalidateSpy.mock.calls.filter(([f]) => f?.queryKey === CAPABILITIES_QUERY_KEY).length;

function cfgError() {
  return new AxiosError('HTTP 404', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'CFG_005', message: 'Tính năng chưa được bật' }, success: false },
    headers: {},
    status: 404,
    statusText: '',
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  invalidateSpy.mockClear();
  queryClient.setQueryData(CAPABILITIES_QUERY_KEY, CAPS);
  appStateListener = undefined;
});

afterEach(() => {
  jest.useRealTimers();
  queryClient.clear();
});

describe('config:updated', () => {
  it('configVersion KHÁC bản đang giữ → làm mới capabilities (CFG-10)', async () => {
    await renderHook(() => useConfigSync());
    await emit(SocketEvent.CONFIG_UPDATED, { configVersion: 'v2', keys: ['features'], v: 1 });
    expect(refreshed()).toBe(1);
  });

  it('CÙNG configVersion → không làm mới (bản này đã tự cập nhật)', async () => {
    await renderHook(() => useConfigSync());
    await emit(SocketEvent.CONFIG_UPDATED, { configVersion: 'v1', keys: [], v: 1 });
    expect(refreshed()).toBe(0);
  });

  it('chưa có bản nào trong bộ nhớ → làm mới (không có gì để so)', async () => {
    queryClient.removeQueries({ queryKey: CAPABILITIES_QUERY_KEY });
    await renderHook(() => useConfigSync());
    await emit(SocketEvent.CONFIG_UPDATED, { configVersion: 'v1', keys: [], v: 1 });
    expect(refreshed()).toBe(1);
  });
});

describe('foreground / reconnect', () => {
  it('ở nền 61 s rồi quay lại → làm mới; chỉ 10 s → không', async () => {
    await renderHook(() => useConfigSync());

    await act(async () => appStateListener?.('background'));
    jest.advanceTimersByTime(10_000);
    await act(async () => appStateListener?.('active'));
    expect(refreshed()).toBe(0);

    await act(async () => appStateListener?.('background'));
    jest.advanceTimersByTime(61_000);
    await act(async () => appStateListener?.('active'));
    expect(refreshed()).toBe(1);
  });

  it('socket nối lại → làm mới, NHƯNG lần nối đầu tiên thì không', async () => {
    await renderHook(() => useConfigSync());
    await emit('connect');
    expect(refreshed()).toBe(0);
    await emit('connect');
    expect(refreshed()).toBe(1);
  });
});

describe('CFG_005', () => {
  it('một API trả CFG_005 → làm mới; bắn dồn trong 30 s chỉ làm mới một lần, sau 30 s lại được', async () => {
    await renderHook(() => useConfigSync());
    const fail = () =>
      queryClient
        .fetchQuery({
          queryFn: () => Promise.reject(cfgError()),
          queryKey: ['x', Math.random()],
          retry: false,
        })
        .catch(() => undefined);

    await act(async () => void (await fail()));
    await act(async () => void (await fail()));
    expect(refreshed()).toBe(1);

    jest.advanceTimersByTime(31_000);
    await act(async () => void (await fail()));
    expect(refreshed()).toBe(2);
  });

  it('lỗi KHÁC (500, hay lỗi mạng) không làm mới', async () => {
    await renderHook(() => useConfigSync());
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryFn: () => Promise.reject(new Error('mạng')),
          queryKey: ['y'],
          retry: false,
        })
        .catch(() => undefined);
    });
    expect(refreshed()).toBe(0);
  });
});
