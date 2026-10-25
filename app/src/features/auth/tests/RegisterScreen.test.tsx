import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { showToast } from '@/shared/utils/toast.utils';
import { completeSignIn } from '@/shell/session/sign-in';

import { httpError, renderScreen } from './render-screen';

/**
 * Đăng ký — mọi lượt thành công đi qua `completeSignIn` (BIO-15: dọn gắn kết sinh trắc học của
 * người trước), nhánh "cần xác thực e-mail" phải BÁO cho người dùng, và câu lỗi/luật mật khẩu phải
 * nói được TRƯỚC khi người dùng đoán.
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/session/sign-in', () => ({ completeSignIn: jest.fn() }));

const mockedRegister = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, register: (...a: unknown[]) => mockedRegister(...a) },
  };
});

const SESSION = { accessToken: 'token', user: null };

beforeEach(() => jest.clearAllMocks());

async function fill(
  overrides: Partial<Record<'name' | 'email' | 'password' | 'confirm', string>> = {},
) {
  const v = {
    confirm: 'Mat-khau-1',
    email: 'A@Vidu.com ',
    name: '  Nguyễn Văn A ',
    password: 'Mat-khau-1',
    ...overrides,
  };
  await fireEvent.changeText(await screen.findByLabelText('Họ và tên, bắt buộc'), v.name);
  await fireEvent.changeText(screen.getByLabelText('Email, bắt buộc'), v.email);
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu, bắt buộc'), v.password);
  await fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu, bắt buộc'), v.confirm);
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Đăng ký' }));

it('nói luật mật khẩu NGAY dưới ô (trước khi gõ), không đợi báo lỗi', async () => {
  await renderScreen(<RegisterScreen />);

  expect(await screen.findByText(PASSWORD_RULE_HINT)).toBeOnTheScreen();
});

it('gửi payload ĐÃ chuẩn hoá và KHÔNG có confirmPassword; xong đi qua completeSignIn', async () => {
  mockedRegister.mockResolvedValue(SESSION);
  await renderScreen(<RegisterScreen />);
  await fill();

  await submit();

  await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith(SESSION, { method: 'PASSWORD' }));
  expect(mockedRegister).toHaveBeenCalledWith({
    email: 'a@vidu.com',
    name: 'Nguyễn Văn A',
    password: 'Mat-khau-1',
  });
  expect(router.dismissTo).not.toHaveBeenCalled();
});

it('BE cần xác thực e-mail (không trả token) ⇒ BÁO người dùng rồi về Đăng nhập bằng dismissTo', async () => {
  mockedRegister.mockResolvedValue(null);
  await renderScreen(<RegisterScreen />);
  await fill();

  await submit();

  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/login'));
  expect(showToast).toHaveBeenCalledWith(
    'info',
    'Đã tạo tài khoản. Kiểm tra hộp thư để kích hoạt.',
  );
  expect(completeSignIn).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

it('email đã đăng ký (409) ⇒ câu rõ ràng tại form, không toast; sửa lại ô ⇒ lỗi biến mất', async () => {
  mockedRegister.mockRejectedValue(httpError(409, 'RES_002'));
  await renderScreen(<RegisterScreen />);
  await fill();

  await submit();

  await screen.findByText(/đã được đăng ký/);
  expect(showToast).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Email, bắt buộc'), 'khac@vidu.com');
  await waitFor(() => expect(screen.queryByText(/đã được đăng ký/)).toBeNull());
});

it.each([
  ['nhập lại không khớp', { confirm: 'Khac-mat-khau-2' }],
  ['mật khẩu yếu', { confirm: 'yeu', password: 'yeu' }],
  ['tên toàn dấu cách', { name: '     ' }],
])('%s ⇒ KHÔNG gọi API', async (_name, overrides) => {
  await renderScreen(<RegisterScreen />);
  await fill(overrides);

  await submit();

  await waitFor(() => expect(mockedRegister).not.toHaveBeenCalled());
  expect(completeSignIn).not.toHaveBeenCalled();
});

it('⛔ gửi hai lần từ bàn phím khi lượt đầu chưa xong ⇒ chỉ MỘT lượt (lượt sau ăn 409 dù tài khoản VỪA tạo xong)', async () => {
  let finish!: (value: unknown) => void;
  mockedRegister.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<RegisterScreen />);
  await fill();

  const confirmInput = screen.getByLabelText('Nhập lại mật khẩu, bắt buộc');
  await fireEvent(confirmInput, 'submitEditing');
  await fireEvent(confirmInput, 'submitEditing');

  await waitFor(() => expect(mockedRegister).toHaveBeenCalledTimes(1));
  finish(SESSION);
  await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
  expect(mockedRegister).toHaveBeenCalledTimes(1);
});

it('bàn phím: ô đầu/giữa dùng "Tiếp" + submitBehavior="submit" (chuyển ô, KHÔNG gửi form, KHÔNG cụp bàn phím)', async () => {
  await renderScreen(<RegisterScreen />);

  for (const label of ['Họ và tên, bắt buộc', 'Email, bắt buộc', 'Mật khẩu, bắt buộc']) {
    const input = await screen.findByLabelText(label);
    expect(input.props.returnKeyType).toBe('next');
    expect(input.props.submitBehavior).toBe('submit');
    await fireEvent(input, 'submitEditing');
  }
  expect(mockedRegister).not.toHaveBeenCalled();
  expect((await screen.findByLabelText('Nhập lại mật khẩu, bắt buộc')).props.returnKeyType).toBe(
    'done',
  );
});

it('"Đăng nhập" ⇒ dismissTo (không chồng thêm một màn Đăng nhập)', async () => {
  await renderScreen(<RegisterScreen />);

  await fireEvent.press(await screen.findByLabelText('Đăng nhập'));

  expect(router.dismissTo).toHaveBeenCalledWith('/login');
  expect(router.push).not.toHaveBeenCalled();
});
