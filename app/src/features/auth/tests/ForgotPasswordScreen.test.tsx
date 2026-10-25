import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { showToast } from '@/shared/utils/toast.utils';

import { httpError, renderScreen } from './render-screen';

/**
 * Quên mật khẩu — câu thành công phải TRUNG TÍNH (không xác nhận email có tài khoản), ĐỨNG LẠI
 * (không toast 5 giây), và lỗi chỉ hiện MỘT chỗ (trong form).
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedForgot = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, forgotPassword: (...a: unknown[]) => mockedForgot(...a) },
  };
});

beforeEach(() => jest.clearAllMocks());

async function typeEmail(email = ' Nguoi.Dung@Vidu.com ') {
  await fireEvent.changeText(await screen.findByLabelText('Email'), email);
}

it('thành công ⇒ Alert TRUNG TÍNH đứng lại, không nhắc địa chỉ email, KHÔNG toast; nút đổi thành "Gửi lại"', async () => {
  mockedForgot.mockResolvedValue(undefined);
  await renderScreen(<ForgotPasswordScreen />);
  await typeEmail();

  await fireEvent.press(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

  await screen.findByText(/Nếu email này có tài khoản/);
  expect(mockedForgot).toHaveBeenCalledWith({ email: 'nguoi.dung@vidu.com' });
  expect(screen.queryByText(/nguoi\.dung@vidu\.com/i)).toBeNull();
  expect(showToast).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Gửi lại hướng dẫn' })).toBeOnTheScreen();
});

it('đổi email sau khi đã gửi ⇒ câu "đã gửi" (nói về địa chỉ CŨ) biến mất', async () => {
  mockedForgot.mockResolvedValue(undefined);
  await renderScreen(<ForgotPasswordScreen />);
  await typeEmail();
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
  await screen.findByText(/Nếu email này có tài khoản/);

  await fireEvent.changeText(screen.getByLabelText('Email'), 'khac@vidu.com');

  await waitFor(() => expect(screen.queryByText(/Nếu email này có tài khoản/)).toBeNull());
});

it('lỗi (429) ⇒ hiện MỘT chỗ trong form, không toast thứ hai', async () => {
  mockedForgot.mockRejectedValue(httpError(429, 'X_TEST', 'Thử lại sau ít phút'));
  await renderScreen(<ForgotPasswordScreen />);
  await typeEmail();

  await fireEvent.press(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

  await screen.findByText('Thử lại sau ít phút');
  expect(showToast).not.toHaveBeenCalled();
  expect(screen.queryByText(/Nếu email này có tài khoản/)).toBeNull();
});

it('email sai định dạng ⇒ KHÔNG gọi API', async () => {
  await renderScreen(<ForgotPasswordScreen />);
  await typeEmail('khong-phai-email');

  await fireEvent.press(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

  await screen.findByText('Email không đúng định dạng');
  expect(mockedForgot).not.toHaveBeenCalled();
});

it('⛔ gửi hai lần từ bàn phím khi lượt đầu chưa xong ⇒ chỉ MỘT lượt (hai email đặt lại, chỉ mã đầu còn dùng được)', async () => {
  let finish!: (value: unknown) => void;
  mockedForgot.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<ForgotPasswordScreen />);
  await typeEmail();

  const input = screen.getByLabelText('Email');
  await fireEvent(input, 'submitEditing');
  await fireEvent(input, 'submitEditing');

  await waitFor(() => expect(mockedForgot).toHaveBeenCalledTimes(1));
  finish(undefined);
  await screen.findByText(/Nếu email này có tài khoản/);
  expect(mockedForgot).toHaveBeenCalledTimes(1);
});

it('lối sang nhập mã LUÔN hiện (không chỉ sau khi gửi); "Quay lại đăng nhập" dùng dismissTo', async () => {
  await renderScreen(<ForgotPasswordScreen />);

  await fireEvent.press(await screen.findByLabelText('Đã có mã? Nhập mã đặt lại mật khẩu'));
  expect(router.push).toHaveBeenCalledWith('/reset-password');

  await fireEvent.press(screen.getByLabelText('Quay lại đăng nhập'));
  expect(router.dismissTo).toHaveBeenCalledWith('/login');
  expect(router.replace).not.toHaveBeenCalled();
});
