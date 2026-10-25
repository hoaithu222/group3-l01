import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AxiosError, type AxiosResponse } from 'axios';
import { router } from 'expo-router';

import { getRefreshToken, setRefreshToken } from '@/core/api/session';
import { connectSocket, disconnectSocket } from '@/core/socket';
import { ChangePasswordScreen } from '@/features/me/screens/ChangePasswordScreen';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { renderWithProviders } from './render-with-providers';

/**
 * `ChangePasswordScreen` (p0-01 mục 10). Sau khi BE nhận lượt đổi:
 *  · có `accessToken` mới ⇒ ghi vào store + NỐI LẠI socket (BE vừa ngắt nó), báo số máy khác đã bị
 *    đăng xuất, quay về Cài đặt;
 *  · không có ⇒ BE đã thu hồi TẤT CẢ phiên (kể cả phiên này) ⇒ dọn phiên, về đăng nhập.
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
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      changePassword: (...args: unknown[]) => mockedChangePassword(...args),
    },
  };
});

const CURRENT = 'Cu-Mat-Khau-1';
const NEXT = 'Moi-Mat-Khau-2';

beforeEach(async () => {
  jest.clearAllMocks();
  await setRefreshToken('refresh-1');
  useAuthStore.getState().setAuth({
    token: 'token-cu',
    user: { email: 'a@b.vn', id: 'u1', name: 'A', permissions: [], roles: [] },
  });
});

async function fillForm(current: string, next: string, confirm: string) {
  await fireEvent.changeText(await screen.findByLabelText('Mật khẩu hiện tại, bắt buộc'), current);
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu mới, bắt buộc'), next);
  await fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu mới, bắt buộc'), confirm);
}

// `getByRole` để không nhầm với tiêu đề AppBar cùng chữ "Đổi mật khẩu".
const pressSubmit = () => fireEvent.press(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

describe('kiểm dữ liệu trước khi gọi máy chủ', () => {
  it.each([
    ['mật khẩu mới yếu', CURRENT, 'yeu', 'yeu', /ít nhất 8 ký tự/],
    ['nhập lại không khớp', CURRENT, NEXT, 'Khac-Mat-Khau-3', /không khớp/],
    ['trùng mật khẩu hiện tại', CURRENT, CURRENT, CURRENT, /phải khác mật khẩu hiện tại/],
  ])('%s ⇒ báo ngay dưới ô, KHÔNG gọi API', async (_name, current, next, confirm, message) => {
    await renderWithProviders(<ChangePasswordScreen />);
    await fillForm(current, next, confirm);

    await pressSubmit();

    await screen.findByText(message);
    expect(mockedChangePassword).not.toHaveBeenCalled();
  });
});

it('BE giữ phiên: gửi ĐÚNG payload (không có confirmPassword) → ghi token mới, nối lại socket, toast, quay lại', async () => {
  mockedChangePassword.mockResolvedValue({ accessToken: 'token-moi', revokedSessions: 2 });
  await renderWithProviders(<ChangePasswordScreen />);
  await fillForm(CURRENT, NEXT, NEXT);

  await pressSubmit();

  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(mockedChangePassword).toHaveBeenCalledWith({
    currentPassword: CURRENT,
    newPassword: NEXT,
  });
  expect(useAuthStore.getState().token).toBe('token-moi');
  // Ngắt rồi mới nối: lệnh ngắt của BE có thể tới SAU phản hồi HTTP.
  expect(disconnectSocket).toHaveBeenCalledTimes(1);
  expect(connectSocket).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith(
    'success',
    'Đã đổi mật khẩu. Đã đăng xuất khỏi 2 thiết bị khác.',
  );
  expect(await getRefreshToken()).toBe('refresh-1');
});

it('không có thiết bị khác ⇒ toast không nhắc "đăng xuất khỏi 0 thiết bị"', async () => {
  mockedChangePassword.mockResolvedValue({ accessToken: 'token-moi', revokedSessions: 0 });
  await renderWithProviders(<ChangePasswordScreen />);
  await fillForm(CURRENT, NEXT, NEXT);

  await pressSubmit();

  await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã đổi mật khẩu.'));
});

it('⛔ BE KHÔNG trả token mới (đã thu hồi TẤT CẢ phiên) ⇒ dọn phiên, về đăng nhập — không ở lại với phiên chết', async () => {
  mockedChangePassword.mockResolvedValue({ revokedSessions: 3 });
  await renderWithProviders(<ChangePasswordScreen />);
  await fillForm(CURRENT, NEXT, NEXT);

  await pressSubmit();

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  expect(useAuthStore.getState().token).toBeNull();
  expect(await getRefreshToken()).toBeNull();
  expect(router.back).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    'info',
    'Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.',
  );
});

it('sai mật khẩu hiện tại (401 AUTH_002) ⇒ "Mật khẩu hiện tại không đúng." tại form, phiên GIỮ NGUYÊN', async () => {
  const response = {
    data: { error: { code: 'AUTH_002', message: 'Token không hợp lệ' } },
    status: 401,
  } as unknown as AxiosResponse;
  mockedChangePassword.mockRejectedValue(
    new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response),
  );
  await renderWithProviders(<ChangePasswordScreen />);
  await fillForm('sai-mat-khau', NEXT, NEXT);

  await pressSubmit();

  await screen.findByText('Mật khẩu hiện tại không đúng.');
  expect(screen.queryByText(/Token không hợp lệ/)).toBeNull();
  expect(useAuthStore.getState().token).toBe('token-cu');
  expect(router.back).not.toHaveBeenCalled();

  // Sửa lại một ô ⇒ lỗi máy chủ cũ biến mất.
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu hiện tại, bắt buộc'), 'gan-dung');
  await waitFor(() => expect(screen.queryByText('Mật khẩu hiện tại không đúng.')).toBeNull());
});
