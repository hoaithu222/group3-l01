import { fireEvent, screen } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import type { BiometricCapability } from '@/core/auth/biometric';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { hapticWarning } from '@/shared/utils/haptics';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { httpError, renderScreen } from './render-screen';

/**
 * Màn Đăng nhập × quyển sách đầu màn (`AuthHeroProvider`): ô MẬT KHẨU nhận bàn phím thì sách gập ("che mắt"), rời ô thì
 * mở; ô email không đụng tới sách. Lỗi từ máy chủ rung cảnh báo đúng MỘT lần — ⛔ lỗi mạng thì không (`haptics.ts`).
 * Trạng thái gập/mở đọc ở `accessibilityState.expanded` của khối (khối ẩn khỏi trợ năng nên phải `includeHiddenElements`).
 * Cùng họ điểm nhấn: ánh quét trên nút "Đăng nhập" chỉ có khi form vừa đủ để gửi, và lớp bọc của nó không chặn cú chạm.
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shared/utils/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticTap: jest.fn(),
  hapticWarning: jest.fn(),
}));
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

beforeEach(() => {
  jest.clearAllMocks();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
});

const hero = () => screen.getByTestId('auth-hero', { includeHiddenElements: true });
/** Ánh quét trên nút "Đăng nhập" (`ReadySheen`) — trang trí, ẩn khỏi trợ năng ⇒ phải xin phần tử ẩn. */
const sheen = () => screen.queryByTestId('ready-sheen', { includeHiddenElements: true });

async function submitFilled() {
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'nguoi.dung@vidu.com');
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'mat-khau');
  await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
}

it('ô mật khẩu nhận bàn phím ⇒ sách GẬP; rời ô ⇒ mở lại; ô email không đụng tới sách', async () => {
  await renderScreen(<LoginScreen />);
  const email = await screen.findByLabelText('Email');
  expect(hero()).toBeExpanded();

  await fireEvent(email, 'focus');
  expect(hero()).toBeExpanded();

  const password = screen.getByLabelText('Mật khẩu');
  await fireEvent(password, 'focus');
  expect(hero()).toBeCollapsed();

  await fireEvent(password, 'blur');
  expect(hero()).toBeExpanded();
});

it('sai mật khẩu (401) ⇒ câu lỗi trong form + rung cảnh báo đúng MỘT lần', async () => {
  mockedLogin.mockRejectedValue(httpError(401, 'AUTH_002', 'Token không hợp lệ'));
  await renderScreen(<LoginScreen />);

  await submitFilled();

  await screen.findByText('Email hoặc mật khẩu không đúng.');
  expect(hapticWarning).toHaveBeenCalledTimes(1);
});

it('⛔ mất mạng ⇒ vẫn báo lỗi nhưng KHÔNG rung (không phải lỗi của người dùng)', async () => {
  mockedLogin.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
  await renderScreen(<LoginScreen />);

  await submitFilled();

  expect(await screen.findByRole('alert')).toBeOnTheScreen();
  expect(hapticWarning).not.toHaveBeenCalled();
});

it('ánh quét trên nút "Đăng nhập" chỉ có khi form VỪA đủ để gửi (cả email lẫn mật khẩu có chữ)', async () => {
  await renderScreen(<LoginScreen />);
  expect(sheen()).toBeNull();

  await fireEvent.changeText(await screen.findByLabelText('Email'), 'nguoi.dung@vidu.com');
  expect(sheen()).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'm');
  expect(sheen()).toBeOnTheScreen();
});

it('lớp bọc ánh quét KHÔNG chặn cú chạm: bấm "Đăng nhập" vẫn gửi đúng dữ liệu đã gõ', async () => {
  mockedLogin.mockRejectedValue(httpError(401, 'AUTH_002', 'Token không hợp lệ'));
  await renderScreen(<LoginScreen />);

  // `fireEvent.press` bỏ qua nút nếu nó hay một lớp cha mang `pointerEvents` chặn chạm — bấm lọt nghĩa là lớp bọc
  // `overflow-hidden rounded-full` không nuốt cú chạm; lớp quét (anh em, nằm TRÊN nút) thì tự nhường chạm.
  await submitFilled();

  await screen.findByText('Email hoặc mật khẩu không đúng.');
  expect(mockedLogin).toHaveBeenCalledWith({ email: 'nguoi.dung@vidu.com', password: 'mat-khau' });
  expect(sheen()).toHaveProp('pointerEvents', 'none');
});
