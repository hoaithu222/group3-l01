import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { act } from 'react';

import { authService } from '@/core/api/auth';
import { unregisterThisDevice } from '@/core/notifications';
import { pendingInviteStore } from '@/features/members/store/pending-invite';

import { clearExplicitLogout, wasExplicitLogout } from '../logout-intent';
import { clearPostLoginIntent } from '../post-login-intent';
import { useLogout } from '../useLogout';
import { wipeUserData } from '../wipe-user-data';

/**
 * `useLogout` dùng CHUNG hàm dọn với các đường phiên chết (`wipeUserData`), và dọn NGAY khi bấm —
 * không chờ `POST /auth/logout` (mất sóng thì chờ vài giây): cuộc gọi/tải lên của người dùng phải
 * ngừng ngay. Việc gỡ token push nằm ở `useLogout.push.test.tsx`.
 */

const mockedReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockedReplace }) }));
jest.mock('@/core/api/auth', () => ({ authService: { logout: jest.fn() } }));
jest.mock('@/core/notifications', () => ({ unregisterThisDevice: jest.fn() }));
jest.mock('@/features/members/store/pending-invite', () => ({
  pendingInviteStore: { clear: jest.fn() },
}));
jest.mock('../post-login-intent', () => ({ clearPostLoginIntent: jest.fn() }));
jest.mock('../wipe-user-data', () => ({ wipeUserData: jest.fn() }));

const testClient = new QueryClient({
  defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0, retry: false } },
});
const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={testClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  clearExplicitLogout();
  jest.mocked(authService.logout).mockResolvedValue(undefined);
  jest.mocked(unregisterThisDevice).mockResolvedValue(true);
});

afterAll(() => testClient.clear());

it('dọn dữ liệu NGAY (trước khi gọi máy chủ), đánh dấu đăng xuất chủ động, xoá ý định chờ, về màn đăng nhập', async () => {
  const { result } = await renderHook(() => useLogout(), { wrapper: Wrapper });

  await act(async () => result.current.logout());

  await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/login'));
  expect(wipeUserData).toHaveBeenCalledTimes(1);
  expect(jest.mocked(wipeUserData).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(authService.logout).mock.invocationCallOrder[0] ?? -1,
  );
  expect(wasExplicitLogout()).toBe(true);
  expect(pendingInviteStore.clear).toHaveBeenCalledTimes(1);
  expect(clearPostLoginIntent).toHaveBeenCalledTimes(1);
});

it('máy chủ lỗi (logout ném) ⇒ dữ liệu ĐÃ được dọn và vẫn về màn đăng nhập', async () => {
  jest.mocked(authService.logout).mockRejectedValue(new Error('mất mạng'));
  const { result } = await renderHook(() => useLogout(), { wrapper: Wrapper });

  await act(async () => result.current.logout());

  await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/login'));
  expect(wipeUserData).toHaveBeenCalledTimes(1);
});
