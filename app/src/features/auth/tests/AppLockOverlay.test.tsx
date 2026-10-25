import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import { AppLockOverlay } from '@/features/auth/components/app-lock/AppLockOverlay';
import {
  APP_LOCK_NOT_YOU_LOGOUT,
  APP_LOCK_PASSWORD_REQUIRES_NETWORK,
} from '@/features/auth/constants/biometric.messages';
import { useAppLockStore } from '@/shell/app-lock';
import { completeSignIn } from '@/shell/session/sign-in';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { httpError, renderScreen } from './render-screen';

/**
 * Lớp phủ khoá ứng dụng (P1): mở khoá bằng MẬT KHẨU (dự phòng khi sinh trắc học/mã máy không dùng
 * được, hoặc mất mạng), "Không phải bạn? Đăng xuất" đủ vùng chạm, và ô nhập theo UI rules
 * (chuỗi Email → Mật khẩu → Mở khoá, lỗi không đứng mãi khi đã sửa).
 */

jest.mock('@/shell/session/sign-in', () => ({ completeSignIn: jest.fn() }));
// Khả năng sinh trắc học không phải chủ đề ở đây; mock đồng bộ để không có cập nhật state bất đồng bộ (act).
jest.mock('@/shared/hooks/useBiometricCapability', () => ({
  useBiometricCapability: () => ({ data: undefined }),
}));
const mockedLogout = jest.fn();
jest.mock('@/shell/session/useLogout', () => ({
  useLogout: () => ({ isPending: false, logout: mockedLogout }),
}));

const mockedLogin = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, login: (...a: unknown[]) => mockedLogin(...a) },
  };
});

const SESSION = { accessToken: 'token-moi', user: null };

beforeEach(() => {
  jest.clearAllMocks();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  useAuthStore.getState().setAuth({
    token: 'token',
    user: { email: 'nguoi-dung@vidu.com', id: 'u1', name: 'A', permissions: [], roles: [] },
  });
  useAppLockStore.setState({ locked: true });
});

async function typePassword(password = 'mat-khau') {
  await fireEvent.changeText(await screen.findByLabelText('Mật khẩu'), password);
}

it('không khoá ⇒ không vẽ gì', async () => {
  useAppLockStore.setState({ locked: false });
  await renderScreen(<AppLockOverlay />);

  expect(screen.queryByText('Mở khoá để tiếp tục')).toBeNull();
});

it('khoá ⇒ nêu email tài khoản đang khoá, điền sẵn ô email', async () => {
  await renderScreen(<AppLockOverlay />);

  await screen.findByText('Mở khoá để tiếp tục');
  expect(screen.getByText('nguoi-dung@vidu.com')).toBeOnTheScreen();
  expect(screen.getByLabelText('Email').props.value).toBe('nguoi-dung@vidu.com');
});

it('mật khẩu đúng ⇒ completeSignIn ĐỨNG NGUYÊN màn đang làm (navigate:false), không về Trang chủ', async () => {
  mockedLogin.mockResolvedValue(SESSION);
  await renderScreen(<AppLockOverlay />);
  await typePassword();

  await fireEvent.press(screen.getByRole('button', { name: 'Mở khoá' }));

  await waitFor(() =>
    expect(completeSignIn).toHaveBeenCalledWith(SESSION, { method: 'PASSWORD', navigate: false }),
  );
  expect(mockedLogin).toHaveBeenCalledWith({ email: 'nguoi-dung@vidu.com', password: 'mat-khau' });
});

it('sai mật khẩu ⇒ câu rõ ràng; sửa lại ô ⇒ lỗi cũ biến mất', async () => {
  mockedLogin.mockRejectedValue(httpError(401, 'AUTH_002', 'Token không hợp lệ'));
  await renderScreen(<AppLockOverlay />);
  await typePassword('sai');

  await fireEvent.press(screen.getByRole('button', { name: 'Mở khoá' }));

  await screen.findByText('Email hoặc mật khẩu không đúng.');
  expect(completeSignIn).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'sai-2');
  await waitFor(() => expect(screen.queryByText('Email hoặc mật khẩu không đúng.')).toBeNull());
});

it('mất mạng ⇒ nói rõ nhánh mật khẩu cần mạng (sinh trắc/mã máy vẫn mở được — BIO-18)', async () => {
  mockedLogin.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
  await renderScreen(<AppLockOverlay />);
  await typePassword();

  await fireEvent.press(screen.getByRole('button', { name: 'Mở khoá' }));

  await screen.findByText(APP_LOCK_PASSWORD_REQUIRES_NETWORK);
});

it('bàn phím: Email "Tiếp" chuyển ô (không gửi); Mật khẩu "Xong" gửi; gửi đúp bị chặn', async () => {
  let finish!: (value: unknown) => void;
  mockedLogin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<AppLockOverlay />);
  await typePassword();

  const email = screen.getByLabelText('Email');
  expect(email.props.returnKeyType).toBe('next');
  expect(email.props.submitBehavior).toBe('submit');
  await fireEvent(email, 'submitEditing');
  expect(mockedLogin).not.toHaveBeenCalled();

  const password = screen.getByLabelText('Mật khẩu');
  await fireEvent(password, 'submitEditing');
  await fireEvent(password, 'submitEditing');
  await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));

  finish(SESSION);
  await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
  expect(mockedLogin).toHaveBeenCalledTimes(1);
});

it('"Không phải bạn? Đăng xuất" là nút thật (LinkButton — đủ vùng chạm) và gọi đăng xuất', async () => {
  await renderScreen(<AppLockOverlay />);

  await fireEvent.press(await screen.findByRole('button', { name: APP_LOCK_NOT_YOU_LOGOUT }));

  expect(mockedLogout).toHaveBeenCalledTimes(1);
});
