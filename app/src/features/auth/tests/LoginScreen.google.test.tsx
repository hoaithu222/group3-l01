import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { BiometricCapability } from '@/core/auth/biometric';
import { GoogleSignInError } from '@/core/auth/social';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { showToast } from '@/shared/utils/toast.utils';
import { completeSignIn } from '@/shell/session/sign-in';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { httpError, renderScreen } from './render-screen';

/**
 * Nút "Tiếp tục với Google" trên màn Đăng nhập: chỉ hiện khi `isGoogleSignInAvailable()`; đi qua `firebaseLogin` rồi
 * `completeSignIn(…, { method: 'SOCIAL' })` (MỘT đường duy nhất); huỷ hộp chọn tài khoản không phải lỗi; lỗi hiện TRONG form (không toast).
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

let mockAvailable = true;
const mockSignInWithGoogle = jest.fn();
jest.mock('@/core/auth/social', () => ({
  ...jest.requireActual('@/core/auth/social'),
  isGoogleSignInAvailable: () => mockAvailable,
  signInWithGoogle: (...a: unknown[]) => mockSignInWithGoogle(...a),
}));

const mockedFirebaseLogin = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      firebaseLogin: (...a: unknown[]) => mockedFirebaseLogin(...a),
    },
  };
});

const SESSION = { accessToken: 'token', user: null };
const BUTTON = 'Tiếp tục với Google';

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockSignInWithGoogle.mockResolvedValue({ idToken: 'firebase-id-token', status: 'success' });
  useBiometricStore.setState({ binding: null, hasHydrated: true });
});

const press = async () => fireEvent.press(await screen.findByRole('button', { name: BUTTON }));

it('không khả dụng (iOS / thiếu webClientId) ⇒ KHÔNG hiện nút Google', async () => {
  mockAvailable = false;
  await renderScreen(<LoginScreen />);
  await screen.findByLabelText('Email');

  expect(screen.queryByText(BUTTON)).toBeNull();
});

it('thành công ⇒ Firebase ID token đi qua firebaseLogin, xong completeSignIn với method SOCIAL', async () => {
  mockedFirebaseLogin.mockResolvedValue(SESSION);
  await renderScreen(<LoginScreen />);

  await press();

  await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith(SESSION, { method: 'SOCIAL' }));
  expect(mockedFirebaseLogin).toHaveBeenCalledWith({ idToken: 'firebase-id-token' });
  expect(showToast).not.toHaveBeenCalled();
});

it('người dùng huỷ hộp chọn tài khoản ⇒ không gọi BE, không hiện lỗi', async () => {
  mockSignInWithGoogle.mockResolvedValue({ status: 'cancelled' });
  await renderScreen(<LoginScreen />);

  await press();

  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
  expect(mockedFirebaseLogin).not.toHaveBeenCalled();
  expect(completeSignIn).not.toHaveBeenCalled();
  // Nút vẫn còn (đã hết trạng thái chờ) và KHÔNG có dải lỗi nào.
  expect(screen.getByRole('button', { name: BUTTON })).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each([
  ['AUTH_022', 401, 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.'],
  ['AUTH_023', 401, 'Tài khoản Google này chưa có email đã xác minh nên chưa thể đăng nhập.'],
  ['SYS_503', 503, 'Đăng nhập bằng Google tạm thời không khả dụng. Vui lòng thử lại sau hoặc đăng nhập bằng email.'],
])('BE trả %s ⇒ câu lỗi nằm TRONG form, không toast, không đăng nhập', async (code, status, message) => {
  mockedFirebaseLogin.mockRejectedValue(httpError(status, code));
  await renderScreen(<LoginScreen />);

  await press();

  await screen.findByText(message);
  expect(showToast).not.toHaveBeenCalled();
  expect(completeSignIn).not.toHaveBeenCalled();
});

it('lỗi phía máy (thiếu Google Play Services) ⇒ câu tiếng Việt theo lý do, không gọi BE', async () => {
  mockSignInWithGoogle.mockRejectedValue(new GoogleSignInError('play-services'));
  await renderScreen(<LoginScreen />);

  await press();

  await screen.findByText(/Google Play Services/);
  expect(mockedFirebaseLogin).not.toHaveBeenCalled();
});

it('lỗi CẤU HÌNH (SHA-1 chưa đăng ký / chưa bật provider Google) ⇒ câu riêng nói rõ nguyên nhân, không phải câu "thử lại"', async () => {
  mockSignInWithGoogle.mockRejectedValue(new GoogleSignInError('misconfigured'));
  await renderScreen(<LoginScreen />);

  await press();

  await screen.findByText(/chưa được thiết lập cho bản cài đặt này/);
  expect(screen.queryByText(/Vui lòng thử lại/)).toBeNull();
  expect(mockedFirebaseLogin).not.toHaveBeenCalled();
});

it('sửa lại ô nhập ⇒ lỗi Google cũ biến mất', async () => {
  mockedFirebaseLogin.mockRejectedValue(httpError(401, 'AUTH_022'));
  await renderScreen(<LoginScreen />);
  await press();
  await screen.findByText('Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.');

  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.com');

  await waitFor(() =>
    expect(screen.queryByText('Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.')).toBeNull(),
  );
});

it('⛔ bấm hai lần khi lượt đầu chưa xong ⇒ chỉ MỘT hộp chọn tài khoản', async () => {
  let finish!: (value: unknown) => void;
  mockSignInWithGoogle.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await renderScreen(<LoginScreen />);

  const button = await screen.findByRole('button', { name: BUTTON });
  await fireEvent.press(button);
  await fireEvent.press(button);

  expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  mockedFirebaseLogin.mockResolvedValue(SESSION);
  finish({ idToken: 'firebase-id-token', status: 'success' });
  await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
});
