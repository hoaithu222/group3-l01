import { Platform } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { logger } from '@/shared/utils/logger';

import { loadGoogleModules, type GoogleModules } from './load-google-modules';

/**
 * Đăng nhập Google → Firebase ID token, để gửi cho `POST /auth/firebase-login`.
 *
 * ── Luồng ────────────────────────────────────────────────────────────────────
 *   1. `@react-native-google-signin` mở hộp chọn tài khoản → ID token CỦA GOOGLE.
 *   2. `@react-native-firebase/auth` đổi nó thành người dùng Firebase (`signInWithCredential`).
 *   3. `getIdToken()` → Firebase ID token (`aud` = project Firebase) — thứ DUY NHẤT BE chịu xác thực.
 *
 * ⛔ Không gửi ID token của Google thẳng cho BE: BE dùng `verifyIdToken` của Firebase Admin (kiểm `aud`/`iss` của đúng
 * project) nên token Google trần bị từ chối `AUTH_022`.
 *
 * ── Vì sao luôn `signOut()` trước và sau ─────────────────────────────────────
 *  · TRƯỚC: BE chỉ nhận token của lần xác thực trong 5 phút gần nhất (claim `auth_time`, `AUTH_022`). Nếu để Google nhớ tài khoản
 *    cũ, `signIn()` trả về ngay bằng phiên cũ — người dùng không chọn được tài khoản khác, và token lấy lại có thể đã quá hạn.
 *  · SAU (Firebase): phiên Firebase chỉ dùng để lấy token; giữ lại là lưu một danh tính thứ hai trên máy mà đăng xuất của app
 *    không dọn (máy dùng chung).
 *
 * Module native được nạp LƯỜI qua `loadGoogleModules()` (`import()` động) — xem `load-google-modules.ts` vì sao không import tĩnh.
 */

/** Lý do thất bại — `features/auth` dịch sang câu tiếng Việt, tầng này không biết giao diện. */
export type GoogleSignInFailure =
  | 'failed'
  | 'misconfigured'
  | 'network'
  | 'not-configured'
  | 'play-services'
  | 'unavailable';

export class GoogleSignInError extends Error {
  constructor(
    readonly reason: GoogleSignInFailure,
    message?: string,
  ) {
    super(message ?? `Đăng nhập Google thất bại: ${reason}`);
    this.name = 'GoogleSignInError';
  }
}

export type GoogleSignInResult =
  /** `idToken` = Firebase ID token. */
  { status: 'success'; idToken: string } | { status: 'cancelled' };

/**
 * Có nên HIỆN nút "Tiếp tục với Google" không.
 *
 * Chỉ Android: iOS cần thêm `GoogleService-Info.plist`, URL scheme đảo ngược và `useFrameworks: static` (`expo-build-properties`) —
 * chưa cấu hình, cùng lý do `registerPushToken` bỏ qua iOS. Thiếu `webClientId` ⇒ ẩn (build không kèm cấu hình Google vẫn chạy bình thường).
 */
export function isGoogleSignInAvailable(): boolean {
  return Platform.OS === 'android' && appConfig.googleWebClientId.length > 0;
}

/** Một mã lỗi có dạng `{ code: string }` (lỗi của Google Sign-In lẫn của Firebase). */
function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Chuỗi `message` của lỗi — Google Sign-In gắn "DEVELOPER_ERROR: …" vào ĐÂY, còn `code` chỉ là "10". */
function errorText(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
}

/**
 * Lỗi CẤU HÌNH — thử lại vô ích nên có câu riêng thay vì "thử lại":
 *  · `DEVELOPER_ERROR` (mã "10") — SHA-1 của keystore ký bản build chưa đăng ký cho app Android trong Firebase (dấu hiệu:
 *    `google-services.json` có `oauth_client: []`), hoặc `webClientId` sai project;
 *  · `auth/operation-not-allowed` — provider Google chưa BẬT trong Firebase Authentication.
 */
function isMisconfigured(error: unknown, code: string | undefined): boolean {
  return code === '10' || code === 'auth/operation-not-allowed' || /DEVELOPER_ERROR/.test(errorText(error));
}

/** Đổi mọi lỗi thô thành `GoogleSignInError`; `null` = người dùng tự huỷ (không phải lỗi). */
function classify(error: unknown, google: GoogleModules[0]): GoogleSignInError | null {
  if (error instanceof GoogleSignInError) return error;
  const code = errorCode(error);
  const { statusCodes } = google;
  // `IN_PROGRESS`: đã có một hộp chọn tài khoản đang mở — bỏ qua lượt này, đừng báo lỗi.
  if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return null;
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return new GoogleSignInError('play-services');
  if (code === 'auth/network-request-failed') return new GoogleSignInError('network');
  if (__DEV__) logger.warn('[google-sign-in] thất bại:', code, error);
  return new GoogleSignInError(isMisconfigured(error, code) ? 'misconfigured' : 'failed');
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!isGoogleSignInAvailable()) throw new GoogleSignInError('not-configured');

  const modules = await loadGoogleModules();
  if (!modules) throw new GoogleSignInError('unavailable');
  const [google, firebase] = modules;
  const { GoogleSignin } = google;

  try {
    GoogleSignin.configure({ webClientId: appConfig.googleWebClientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => undefined);

    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return { status: 'cancelled' };
    const googleIdToken = response.data.idToken;
    if (!googleIdToken) throw new GoogleSignInError('failed');

    const auth = firebase.getAuth();
    try {
      const credential = firebase.GoogleAuthProvider.credential(googleIdToken);
      const { user } = await firebase.signInWithCredential(auth, credential);
      return { status: 'success', idToken: await firebase.getIdToken(user) };
    } finally {
      await firebase.signOut(auth).catch(() => undefined);
    }
  } catch (error) {
    const failure = classify(error, google);
    if (failure === null) return { status: 'cancelled' };
    throw failure;
  }
}
