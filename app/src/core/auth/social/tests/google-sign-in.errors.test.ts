import { Platform } from 'react-native';

import { appConfig } from '@/core/config/env.config';

import { GoogleSignInError, signInWithGoogle } from '../google-sign-in';
import { createGoogleMocks, WEB_CLIENT_ID } from './google-mocks';

/**
 * Cách `signInWithGoogle` dịch lỗi của Google Sign-In / Firebase: người dùng tự huỷ KHÔNG phải lỗi; còn lại ra `GoogleSignInError`
 * với `reason` (không lộ chi tiết kỹ thuật); phiên Firebase luôn được dọn kể cả khi lỗi.
 */

jest.mock('@/core/config/env.config', () => ({
  appConfig: { googleWebClientId: 'web-client.apps.googleusercontent.com' },
}));
const config = appConfig as { googleWebClientId: string };

const { arm, firebase, google } = createGoogleMocks();
const mockLoad = jest.fn();
jest.mock('../load-google-modules', () => ({ loadGoogleModules: () => mockLoad() }));

const originalOS = Platform.OS;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // Nhánh "lỗi lạ" cố ý ghi `console.warn` ở __DEV__ — giữ log test sạch.
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  Platform.OS = 'android';
  config.googleWebClientId = WEB_CLIENT_ID;
  mockLoad.mockResolvedValue([google, firebase]);
  arm();
});

afterEach(() => {
  warnSpy.mockRestore();
});

afterAll(() => {
  Platform.OS = originalOS;
});

describe('signInWithGoogle — lỗi', () => {
  it.each(['SIGN_IN_CANCELLED', 'IN_PROGRESS'])('lỗi %s ⇒ cancelled, không phải lỗi', async (code) => {
    google.GoogleSignin.signIn.mockRejectedValue({ code });

    await expect(signInWithGoogle()).resolves.toEqual({ status: 'cancelled' });
  });

  it('Google không trả idToken ⇒ lỗi "failed", không gọi Firebase', async () => {
    google.GoogleSignin.signIn.mockResolvedValue({ data: { idToken: null }, type: 'success' });

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'failed' });
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
  });

  it('thiếu Google Play Services ⇒ reason play-services', async () => {
    google.GoogleSignin.hasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'play-services' });
  });

  it('Firebase mất mạng ⇒ reason network, và vẫn dọn phiên Firebase', async () => {
    firebase.signInWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'network' });
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it('lấy Firebase ID token lỗi ⇒ vẫn dọn phiên Firebase (không để lại danh tính thứ hai trên máy)', async () => {
    firebase.getIdToken.mockRejectedValue(new Error('boom'));

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'failed' });
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it('lỗi lạ, không rõ nguyên nhân ⇒ reason failed, không lộ chi tiết kỹ thuật', async () => {
    google.GoogleSignin.signIn.mockRejectedValue(Object.assign(new Error('mã lạ 12345'), { code: '12345' }));

    const error = await signInWithGoogle().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleSignInError);
    expect(error).toMatchObject({ reason: 'failed' });
    expect((error as Error).message).not.toMatch(/12345/);
  });
});

/**
 * Lỗi CẤU HÌNH phải có `reason` riêng: "thử lại" vô ích, và câu chung "Không đăng nhập được" khiến người thử không biết cần đăng ký
 * SHA-1 / bật provider Google (log Railway 2026-09-27: `google-services.json` có `oauth_client: []`).
 */
describe('signInWithGoogle — lỗi cấu hình', () => {
  it('DEVELOPER_ERROR (mã "10", SHA-1 chưa đăng ký) ⇒ reason misconfigured, không lộ chi tiết kỹ thuật', async () => {
    google.GoogleSignin.signIn.mockRejectedValue(Object.assign(new Error('DEVELOPER_ERROR: Follow troubleshooting'), { code: '10' }));

    const error = await signInWithGoogle().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleSignInError);
    expect(error).toMatchObject({ reason: 'misconfigured' });
    expect((error as Error).message).not.toMatch(/DEVELOPER_ERROR/);
  });

  it('nhận ra DEVELOPER_ERROR chỉ qua `message` (máy/bản thư viện không kèm mã "10")', async () => {
    google.GoogleSignin.signIn.mockRejectedValue(new Error('DEVELOPER_ERROR'));

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'misconfigured' });
  });

  it('provider Google chưa bật trong Firebase (`auth/operation-not-allowed`) ⇒ misconfigured, và vẫn dọn phiên Firebase', async () => {
    firebase.signInWithCredential.mockRejectedValue({ code: 'auth/operation-not-allowed' });

    await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'misconfigured' });
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });
});
