import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { act } from 'react';

import { useRequestAccountDeletion } from '../hooks/useAccountDeletion';
import { useChangePassword } from '../hooks/useChangePassword';

/**
 * Chống GỬI ĐÚP ở tầng hook — `Button loading` khoá được nút, còn bàn phím ("Xong"/"Gửi") thì
 * không, và `isPending` của React Query cập nhật BẤT ĐỒNG BỘ (sau một lần vẽ) nên lượt gọi thứ hai
 * trong cùng khung hình vẫn thấy `false`. Kiểm ở tầng hook vì ở tầng màn hình ô nhập đã bị khoá khi
 * đang gửi — test không thể tới được đúng khe hở này.
 *
 * Hậu quả nếu thiếu: đổi mật khẩu hai lần (lượt sau ăn 400 "mật khẩu mới phải khác…") và yêu cầu xoá
 * hai lần (lượt sau chạy SAU khi phiên đã bị thu hồi, điều hướng hai lần).
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  connectSocket: jest.fn(),
  disconnectSocket: jest.fn(),
}));

const mockedChangePassword = jest.fn();
const mockedRequestAccountDeletion = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      changePassword: (...args: unknown[]) => mockedChangePassword(...args),
      requestAccountDeletion: (...args: unknown[]) => mockedRequestAccountDeletion(...args),
    },
  };
});

const testClient = new QueryClient({
  defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false } },
});
const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={testClient}>{children}</QueryClientProvider>
);

/** Lượt gọi API CHƯA xong cho tới khi test cho phép — giống mạng chậm. */
function pendingCall(mock: jest.Mock): (value: unknown) => void {
  let finish!: (value: unknown) => void;
  mock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  return finish;
}

beforeEach(() => jest.clearAllMocks());
afterAll(() => testClient.clear());

it('useChangePassword: hai lượt gọi liền nhau khi lượt đầu chưa xong ⇒ MỘT lượt gọi API', async () => {
  const finish = pendingCall(mockedChangePassword);
  const { result } = await renderHook(() => useChangePassword(), { wrapper: Wrapper });
  const values = {
    confirmPassword: 'Moi-1234',
    currentPassword: 'Cu-1234',
    newPassword: 'Moi-1234',
  };

  await act(async () => {
    result.current.changePassword(values);
    result.current.changePassword(values);
  });

  expect(mockedChangePassword).toHaveBeenCalledTimes(1);
  finish({ accessToken: 'token-moi', revokedSessions: 0 });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  // Xong lượt đầu thì được gửi lại (ví dụ sửa mật khẩu sau khi lỗi).
  mockedChangePassword.mockResolvedValue({ accessToken: 'token-3', revokedSessions: 0 });
  await act(async () => result.current.changePassword(values));
  expect(mockedChangePassword).toHaveBeenCalledTimes(2);
});

it('useRequestAccountDeletion: hai lượt gọi liền nhau khi lượt đầu chưa xong ⇒ MỘT lượt gọi API', async () => {
  const finish = pendingCall(mockedRequestAccountDeletion);
  const { result } = await renderHook(() => useRequestAccountDeletion(), { wrapper: Wrapper });

  await act(async () => {
    result.current.requestDeletion({ password: 'mat-khau' });
    result.current.requestDeletion({ password: 'mat-khau' });
  });

  expect(mockedRequestAccountDeletion).toHaveBeenCalledTimes(1);
  finish({ deletionGraceUntil: null, status: 'PENDING_DELETION' });
  await waitFor(() => expect(result.current.isPending).toBe(false));
});
