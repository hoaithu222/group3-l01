import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act } from 'react';

import { authService } from '@/core/api/auth';
import { queryClient as appQueryClient } from '@/core/config/query-client';
import { unregisterThisDevice } from '@/core/notifications';

import { useLogout } from '../useLogout';

/**
 * p0-06 `app.md` §5 (NT-07): đăng xuất phải gỡ token thiết bị khỏi tài khoản (`DELETE /me/devices/:id`) —
 * nhưng KHÔNG bao giờ để việc đó chặn đăng xuất.
 */

const mockedReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockedReplace }) }));
jest.mock('@/core/api/auth', () => ({ authService: { logout: jest.fn() } }));
jest.mock('@/core/notifications', () => ({ unregisterThisDevice: jest.fn() }));
jest.mock('@/core/socket', () => ({ disconnectSocket: jest.fn() }));

const mockedLogout = jest.mocked(authService.logout);
const mockedUnregister = jest.mocked(unregisterThisDevice);

/**
 * Client riêng cho `useMutation` với `gcTime: 0`. `useLogout` tự `queryClient.clear()` client TOÀN CỤC ở
 * `onSettled`; dùng chính client đó cho hook thì mutation bị dọn xong lại được hẹn giờ gc 5 phút lúc gỡ
 * observer — timer sống làm Jest chạy đơn lẻ không thoát được ("worker failed to exit gracefully").
 */
const testClient = new QueryClient({
  defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0, retry: false } },
});

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLogout.mockResolvedValue(undefined);
  mockedUnregister.mockResolvedValue(true);
});

afterAll(() => {
  testClient.clear();
  appQueryClient.clear();
});

describe('useLogout — gỡ token push', () => {
  it('gọi cả unregisterThisDevice lẫn authService.logout, gỡ token TRƯỚC khi POST /auth/logout', async () => {
    const { result } = await renderHook(() => useLogout(), { wrapper: Wrapper });

    await act(async () => result.current.logout());

    await waitFor(() => expect(mockedReplace).toHaveBeenCalled());
    expect(mockedUnregister).toHaveBeenCalledTimes(1);
    expect(mockedLogout).toHaveBeenCalledTimes(1);
    // Cả hai bắt đầu khi access token còn hiệu lực — `purgeSession()` chỉ chạy SAU khi logout() xong.
    expect(mockedUnregister.mock.invocationCallOrder[0]).toBeLessThan(
      mockedLogout.mock.invocationCallOrder[0] ?? -1,
    );
  });

  it('gỡ token thất bại (mất mạng) → vẫn đăng xuất và điều hướng về màn đăng nhập', async () => {
    mockedUnregister.mockResolvedValue(false);
    const { result } = await renderHook(() => useLogout(), { wrapper: Wrapper });

    await act(async () => result.current.logout());

    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/login'));
    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });
});
