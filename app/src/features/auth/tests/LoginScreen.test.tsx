import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { BiometricCapability } from '@/core/auth/biometric';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { showToast } from '@/shared/utils/toast.utils';
import { completeSignIn } from '@/shell/session/sign-in';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { httpError, renderScreen } from './render-screen';

/**
 * Đăng nhập — câu lỗi dịch theo NGỮ CẢNH (BE trả sai mật khẩu bằng mã AUTH_002, bảng mã của app
 * ghi mã đó là "Token không hợp lệ"), `AUTH_012` dẫn sang "Khôi phục tài khoản", chống gửi đúp từ
 * bàn phím, và chuỗi ô nhập Email → Mật khẩu → Gửi.
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/session/sign-in', () => ({ completeSignIn: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));

const NO_BIOMETRIC: BiometricCapability = {
  hasHardware: false,
  icon: 'lock',
  isUsable: false,
  kind: 'FINGERPRINT',
  label: 'vân tay',
};
jest.mock('@/core/auth/biometric', () => ({
  ...jest.requireActual('@/core/auth/biometric'),
  getBiometricCapability: () => Promise.resolve(NO_BIOMETRIC),
}));

const mockedLogin = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, login: (...a: unknown[]) => mockedLogin(...a) },
  };
});

const SESSION = { accessToken: 'token', user: null };

beforeEach(() => {
  jest.clearAllMocks();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
});

async function fill(email = ' Nguoi.Dung@Vidu.com ', password = 'mat-khau') {
  await fireEvent.changeText(await screen.findByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), password);
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));

it('thành công ⇒ gửi email đã chuẩn hoá, xong đi qua completeSignIn (một đường duy nhất)', async () => {
  mockedLogin.mockResolvedValue(SESSION);
  await renderScreen(<LoginScreen />);
  await fill();

  await submit();

  await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith(SESSION, { method: 'PASSWORD' }));
  expect(mockedLogin).toHaveBeenCalledWith({ email: 'nguoi.dung@vidu.com', password: 'mat-khau' });
});

it('sai mật khẩu (401 AUTH_002) ⇒ "Email hoặc mật khẩu không đúng." — KHÔNG phải "Token không hợp lệ", KHÔNG toast', async () => {
  mockedLogin.mockRejectedValue(httpError(401, 'AUTH_002', 'Token không hợp lệ'));
  await renderScreen(<LoginScreen />);
  await fill();

  await submit();

  await screen.findByText('Email hoặc mật khẩu không đúng.');
  expect(screen.queryByText(/Token/)).toBeNull();
  expect(showToast).not.toHaveBeenCalled();
  expect(completeSignIn).not.toHaveBeenCalled();
});

it('sửa lại ô nhập ⇒ lỗi máy chủ cũ biến mất (không báo điều không còn đúng)', async () => {
  mockedLogin.mockRejectedValue(httpError(401, 'AUTH_001'));
  await renderScreen(<LoginScreen />);
  await fill();
  await submit();
  await screen.findByText('Email hoặc mật khẩu không đúng.');

  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'mat-khau-2');

  await waitFor(() => expect(screen.queryByText('Email hoặc mật khẩu không đúng.')).toBeNull());
});

it('AUTH_012 (đang chờ xoá) ⇒ sang Khôi phục tài khoản kèm email đã nhập (đã chuẩn hoá)', async () => {
  mockedLogin.mockRejectedValue(httpError(403, 'AUTH_012'));
  await renderScreen(<LoginScreen />);
  await fill();

  await submit();

  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith({
      params: { email: 'nguoi.dung@vidu.com' },
      pathname: '/restore-account',
    }),
  );
});

it('AUTH_012 kèm details.deletionGraceUntil ⇒ chuyển luôn mốc hết ân hạn sang màn Khôi phục', async () => {
  mockedLogin.mockRejectedValue(
    httpError(403, 'AUTH_012', 'msg', { deletionGraceUntil: '2026-10-20T00:00:00.000Z' }),
  );
  await renderScreen(<LoginScreen />);
  await fill();

  await submit();

  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith({
      params: { email: 'nguoi.dung@vidu.com', until: '2026-10-20T00:00:00.000Z' },
      pathname: '/restore-account',
    }),
  );
});

it('bàn phím: Email "Tiếp" (chuyển ô, không gửi, không cụp bàn phím) → Mật khẩu "Xong" gửi form', async () => {
  mockedLogin.mockResolvedValue(SESSION);
  await renderScreen(<LoginScreen />);
  await fill();

  const email = screen.getByLabelText('Email');
  expect(email.props.returnKeyType).toBe('next');
  expect(email.props.submitBehavior).toBe('submit');
  await fireEvent(email, 'submitEditing');
  expect(mockedLogin).not.toHaveBeenCalled();

  const password = screen.getByLabelText('Mật khẩu');
  expect(password.props.returnKeyType).toBe('done');
  await fireEvent(password, 'submitEditing');
  await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));
});

it('⛔ gửi hai lần từ bàn phím khi lượt đầu chưa xong ⇒ chỉ MỘT lượt (mỗi lượt xoay refresh token)', async () => {
  let finish!: (value: unknown) => void;
  mockedLogin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<LoginScreen />);
  await fill();

  const password = screen.getByLabelText('Mật khẩu');
  await fireEvent(password, 'submitEditing');
  await fireEvent(password, 'submitEditing');

  await waitFor(() => expect(mockedLogin).toHaveBeenCalledTimes(1));
  finish(SESSION);
  await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
  expect(mockedLogin).toHaveBeenCalledTimes(1);
});

it('email/mật khẩu trống ⇒ KHÔNG gọi API', async () => {
  await renderScreen(<LoginScreen />);

  await submit();

  await waitFor(() => expect(mockedLogin).not.toHaveBeenCalled());
});

it('không có gắn kết sinh trắc học ⇒ KHÔNG hiện nút sinh trắc học', async () => {
  await renderScreen(<LoginScreen />);
  await screen.findByLabelText('Email');

  expect(screen.queryByLabelText(/vân tay|Face ID|sinh trắc/i)).toBeNull();
});

it('liên kết: "Quên mật khẩu?" và "Đăng ký" mở màn kế (push — Back quay lại Đăng nhập)', async () => {
  await renderScreen(<LoginScreen />);

  await fireEvent.press(await screen.findByLabelText('Quên mật khẩu?'));
  expect(router.push).toHaveBeenCalledWith('/forgot-password');

  await fireEvent.press(screen.getByLabelText('Đăng ký'));
  expect(router.push).toHaveBeenLastCalledWith('/register');
});
