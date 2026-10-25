import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { io } from 'socket.io-client';

import { authService } from '@/core/api/auth';
import { apiClient } from '@/core/api/client';
import { onSessionEnded, __resetSessionEndListenersForTests } from '@/core/api/session-end';
import { purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import '@/core/socket';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useSavedMessagesStore } from '@/shared/saved/saved.store';
import {
  __resetSessionWipeRegistrationForTests,
  registerSessionWipe,
} from '@/shell/session/register-session-wipe';
import { WIPE_STEPS } from '@/shell/session/wipe-steps';
import { wipeUserData } from '@/shell/session/wipe-user-data';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * CẢ BỐN đường phiên chết phải cùng đi qua MỘT hàm dọn.
 *
 * ⛔ Lỗi đã có thật: chỉ `useLogout` dọn store; ba đường còn lại (refresh trả 4xx, request 401
 * không cứu được, socket bị từ chối ở handshake) chỉ gọi `purgeSession()` — store chat/gọi/thi
 * thử của người cũ nằm nguyên cho người kế tiếp trên cùng máy.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

/** Mọi request ăn 401 — mô phỏng phiên đã chết. */
const alwaysUnauthorized: AxiosAdapter = (config) =>
  Promise.reject(
    new AxiosError('401', 'ERR_BAD_REQUEST', config, {}, {
      config,
      data: {},
      headers: {},
      status: 401,
      statusText: '',
    } as unknown as AxiosResponse),
  );

interface MockSocket {
  on: jest.Mock;
}
const mockSocket = (io as jest.Mock).mock.results[0]?.value as MockSocket;
const connectErrorHandlers = mockSocket.on.mock.calls
  .filter(([event]) => event === 'connect_error')
  .map(([, handler]) => handler as (error: unknown) => Promise<void> | void);

function seedUserData(): void {
  useSavedMessagesStore.getState().mark('m1', true);
  useUploadStore.setState({
    items: { a: { localId: 'a', scope: 'MESSAGE', status: 'queued' } as never },
  });
}
const isClean = () =>
  Object.keys(useSavedMessagesStore.getState().ids).length === 0 &&
  Object.keys(useUploadStore.getState().items).length === 0;

beforeEach(async () => {
  mockFetch.mockReset();
  __resetSessionEndListenersForTests();
  __resetSessionWipeRegistrationForTests();
  await purgeSession();
  registerSessionWipe();
  await setRefreshToken('refresh-cu');
  setAccessToken('access-cu');
  seedUserData();
});

afterAll(() => __resetSessionEndListenersForTests());

describe('bốn đường phiên chết → cùng dọn', () => {
  it('1. đăng xuất (authService.logout)', async () => {
    apiClient.defaults.adapter = (config) =>
      Promise.resolve({ config, data: {}, headers: {}, status: 200, statusText: '' });

    await authService.logout();

    expect(isClean()).toBe(true);
  });

  it('2. refresh trả 4xx (máy chủ nói phiên đã chết)', async () => {
    apiClient.defaults.adapter = alwaysUnauthorized;
    mockFetch.mockResolvedValue({ json: async () => ({}), ok: false, status: 401 } as Response);

    await expect(apiClient.get('/reports', { skipErrorToast: true })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(useAuthStore.getState().token).toBeNull();
    expect(isClean()).toBe(true);
  });

  it('3. refresh được nhưng lượt phát lại VẪN 401 (không còn đường cứu)', async () => {
    apiClient.defaults.adapter = alwaysUnauthorized;
    mockFetch.mockResolvedValue({
      json: async () => ({ accessToken: 'moi' }),
      ok: true,
      status: 200,
    } as Response);

    await expect(apiClient.get('/reports', { skipErrorToast: true })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(isClean()).toBe(true);
  });

  it('4. socket bị từ chối ở handshake (AUTH_012: tài khoản đang chờ xoá)', async () => {
    expect(connectErrorHandlers.length).toBeGreaterThan(0);

    await Promise.all(
      connectErrorHandlers.map((handler) => handler({ data: { code: 'AUTH_012' }, message: 'x' })),
    );

    expect(isClean()).toBe(true);
  });
});

describe('cơ chế', () => {
  it('`socket` đứng ĐẦU: ngắt socket trước khi dọn store', () => {
    expect(Object.keys(WIPE_STEPS)[0]).toBe('socket');
  });

  it('một bước hỏng KHÔNG chặn các bước còn lại và wipeUserData không ném', async () => {
    const spy = jest.spyOn(WIPE_STEPS, 'chat').mockImplementation(() => {
      throw new Error('hỏng');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(wipeUserData()).resolves.toBeUndefined();

    expect(isClean()).toBe(true);
    spy.mockRestore();
  });

  it('idempotent — chạy hai lần liền không lỗi', async () => {
    await wipeUserData();
    await expect(wipeUserData()).resolves.toBeUndefined();
  });

  it('người nghe khác vẫn nhận thông báo (registry không bị wipe chiếm)', async () => {
    const other = jest.fn();
    onSessionEnded(other);

    await purgeSession();

    expect(other).toHaveBeenCalledTimes(1);
  });
});
