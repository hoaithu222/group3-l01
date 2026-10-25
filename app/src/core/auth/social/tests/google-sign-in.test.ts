import { Platform } from 'react-native';

import { appConfig } from '@/core/config/env.config';

import { isGoogleSignInAvailable, signInWithGoogle } from '../google-sign-in';
import { createGoogleMocks, WEB_CLIENT_ID } from './google-mocks';

/**
 * Luồng Google → Firebase ID token (đường thành công, huỷ, chưa cấu hình). Các ca lỗi: `google-sign-in.errors.test.ts`.
 * Kiểm THỨ TỰ gọi: `signOut` Google trước khi chọn tài khoản, dọn phiên Firebase sau khi lấy token.
 */

jest.mock('@/core/config/env.config', () => ({
  appConfig: { googleWebClientId: 'web-client.apps.googleusercontent.com' },
}));
// `appConfig` là `as const` (chỉ đọc) — test cần đổi `googleWebClientId` giữa các ca.
const config = appConfig as { googleWebClientId: string };

const { arm, firebase, google } = createGoogleMocks();
const mockLoad = jest.fn();
jest.mock('../load-google-modules', () => ({ loadGoogleModules: () => mockLoad() }));

/** Thứ tự (toàn cục) của lần gọi đầu; chưa từng gọi ⇒ vô cực để phép so sánh thứ tự thất bại thay vì bị bỏ qua. */
const firstCallOrder = (fn: jest.Mock): number => fn.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  config.googleWebClientId = WEB_CLIENT_ID;
  mockLoad.mockResolvedValue([google, firebase]);
  arm();
});

afterAll(() => {
  Platform.OS = originalOS;
});

describe('isGoogleSignInAvailable', () => {
  it('Android + có webClientId ⇒ true', () => {
    expect(isGoogleSignInAvailable()).toBe(true);
  });

  it('thiếu webClientId ⇒ false (ẩn nút, build không kèm cấu hình Google vẫn chạy)', () => {
    config.googleWebClientId = '';
    expect(isGoogleSignInAvailable()).toBe(false);
  });

  it('iOS ⇒ false (chưa cấu hình GoogleService-Info.plist / URL scheme)', () => {
    Platform.OS = 'ios';
    expect(isGoogleSignInAvailable()).toBe(false);
  });
});

describe('signInWithGoogle', () => {
  it('thành công ⇒ Firebase ID token; signOut Google TRƯỚC khi chọn tài khoản, dọn phiên Firebase SAU', async () => {
    await expect(signInWithGoogle()).resolves.toEqual({ idToken: 'firebase-id-token', status: 'success' });

    expect(google.GoogleSignin.configure).toHaveBeenCalledWith({ webClientId: WEB_CLIENT_ID });
    expect(firebase.GoogleAuthProvider.credential).toHaveBeenCalledWith('google-id-token');
    expect(firebase.signInWithCredential).toHaveBeenCalledWith('auth-instance', {
      providerToken: 'google-id-token',
    });
    expect(firebase.getIdToken).toHaveBeenCalledWith({ uid: 'u' });
    // Luôn bắt chọn tài khoản MỚI (BE chỉ nhận token của lần xác thực trong 5 phút).
    expect(firstCallOrder(google.GoogleSignin.signOut)).toBeLessThan(firstCallOrder(google.GoogleSignin.signIn));
    expect(firebase.signOut).toHaveBeenCalledWith('auth-instance');
  });

  it('người dùng đóng hộp chọn tài khoản (type: cancelled) ⇒ cancelled, KHÔNG đụng Firebase', async () => {
    google.GoogleSignin.signIn.mockResolvedValue({ data: null, type: 'cancelled' });

    await expect(signInWithGoogle()).resolves.toEqual({ status: 'cancelled' });
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
  });

  it('chưa cấu hình (không có webClientId) ⇒ not-configured, không nạp module native', async () => {
    config.googleWebClientId = '';

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'not-configured' });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('thiếu module native (bản dev-client/APK cũ chưa build lại) ⇒ reason unavailable, không crash', async () => {
    mockLoad.mockResolvedValue(null);

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
