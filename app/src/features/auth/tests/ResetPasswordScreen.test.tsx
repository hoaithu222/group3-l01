import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen';
import { showToast } from '@/shared/utils/toast.utils';

import { httpError, renderScreen } from './render-screen';

/**
 * Đặt lại mật khẩu — SEC-05 (p0-01 B4): form đặt tên field `password` nhưng BE đòi `newPassword`;
 * thiếu bước map thì MỌI lượt đặt lại bị BE từ chối 400. Mã tới theo hai đường (deep link / dán tay).
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useLocalSearchParams: jest.fn(), useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedReset = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, resetPassword: (...a: unknown[]) => mockedReset(...a) },
  };
});

const NEW_PASSWORD = 'Mat-khau-moi-1';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({} as never);
});

async function fillPasswords(password = NEW_PASSWORD, confirm = NEW_PASSWORD) {
  await fireEvent.changeText(await screen.findByLabelText('Mật khẩu mới'), password);
  await fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu mới'), confirm);
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

it('SEC-05: gửi { token, newPassword } — KHÔNG có password/confirmPassword', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ token: 'ma-tu-deep-link' } as never);
  mockedReset.mockResolvedValue(undefined);
  await renderScreen(<ResetPasswordScreen />);
  await fillPasswords();

  await submit();

  await waitFor(() => expect(mockedReset).toHaveBeenCalledTimes(1));
  expect(mockedReset).toHaveBeenCalledWith({ newPassword: NEW_PASSWORD, token: 'ma-tu-deep-link' });
  expect(mockedReset.mock.calls[0]?.[0]).not.toHaveProperty('password');
  expect(mockedReset.mock.calls[0]?.[0]).not.toHaveProperty('confirmPassword');
});

it('tới bằng deep link ⇒ ẩn ô mã; nhập tay ⇒ hiện ô mã', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ token: 'abc' } as never);
  const linked = await renderScreen(<ResetPasswordScreen />);
  await screen.findByLabelText('Mật khẩu mới');
  expect(screen.queryByLabelText('Mã đặt lại')).toBeNull();
  await linked.unmount();

  jest.mocked(useLocalSearchParams).mockReturnValue({} as never);
  await renderScreen(<ResetPasswordScreen />);
  expect(await screen.findByLabelText('Mã đặt lại')).toBeOnTheScreen();
});

it('⛔ mã DÁN tay kèm dấu cách/xuống dòng ⇒ được cắt trước khi gửi', async () => {
  mockedReset.mockResolvedValue(undefined);
  await renderScreen(<ResetPasswordScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Mã đặt lại'), '  ma-dan-tay\n');
  await fillPasswords();

  await submit();

  await waitFor(() =>
    expect(mockedReset).toHaveBeenCalledWith({ newPassword: NEW_PASSWORD, token: 'ma-dan-tay' }),
  );
});

it('thành công ⇒ toast + về Đăng nhập bằng dismissTo (ngăn xếp [Đăng nhập, Quên MK, Đặt lại] không sinh Đăng nhập thứ hai)', async () => {
  mockedReset.mockResolvedValue(undefined);
  await renderScreen(<ResetPasswordScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Mã đặt lại'), 'ma');
  await fillPasswords();

  await submit();

  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/login'));
  expect(showToast).toHaveBeenCalledWith(
    'success',
    'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.',
  );
  expect(router.replace).not.toHaveBeenCalled();
});

it('mã sai/hết hạn (401 AUTH_008) ⇒ câu rõ ràng tại form; sửa lại ô ⇒ lỗi biến mất', async () => {
  mockedReset.mockRejectedValue(httpError(401, 'AUTH_008'));
  await renderScreen(<ResetPasswordScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Mã đặt lại'), 'ma-cu');
  await fillPasswords();

  await submit();

  await screen.findByText('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.');
  expect(showToast).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Mã đặt lại'), 'ma-moi');
  await waitFor(() => expect(screen.queryByText(/không hợp lệ hoặc đã hết hạn/)).toBeNull());
});

it('mật khẩu mới yếu/không khớp ⇒ KHÔNG gọi API; luật hiện sẵn dưới ô', async () => {
  await renderScreen(<ResetPasswordScreen />);
  expect(await screen.findByText(PASSWORD_RULE_HINT)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Mã đặt lại'), 'ma');

  await fillPasswords('yeu', 'yeu');
  await submit();
  await waitFor(() => expect(mockedReset).not.toHaveBeenCalled());

  await fillPasswords(NEW_PASSWORD, 'Khac-mat-khau-2');
  await submit();
  await screen.findByText('Mật khẩu nhập lại không khớp');
  expect(mockedReset).not.toHaveBeenCalled();
});

it('"Yêu cầu mã mới" ⇒ dismissTo Quên mật khẩu; "Quay lại đăng nhập" ⇒ dismissTo Đăng nhập', async () => {
  await renderScreen(<ResetPasswordScreen />);

  await fireEvent.press(await screen.findByLabelText('Yêu cầu mã mới'));
  expect(router.dismissTo).toHaveBeenCalledWith('/forgot-password');

  await fireEvent.press(screen.getByLabelText('Quay lại đăng nhập'));
  expect(router.dismissTo).toHaveBeenLastCalledWith('/login');
  expect(router.push).not.toHaveBeenCalled();
});

it('⛔ gửi hai lần từ bàn phím khi lượt đầu chưa xong ⇒ chỉ MỘT lượt gọi', async () => {
  let finish!: (value: unknown) => void;
  mockedReset.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<ResetPasswordScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Mã đặt lại'), 'ma');
  await fillPasswords();

  const confirmInput = screen.getByLabelText('Nhập lại mật khẩu mới');
  await fireEvent(confirmInput, 'submitEditing');
  await fireEvent(confirmInput, 'submitEditing');

  await waitFor(() => expect(mockedReset).toHaveBeenCalledTimes(1));
  finish(undefined);
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledTimes(1));
  expect(mockedReset).toHaveBeenCalledTimes(1);
});
