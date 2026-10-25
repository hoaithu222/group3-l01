import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getDeviceId } from '@/core/device/device-id';
import { logger } from '@/shared/utils/logger';

import { devicesService } from './devices.service';
import { getPushPermission } from './permission';

/**
 * Đăng ký / đổi / huỷ token thiết bị với BE (p0-06 `app.md` §4 "Đăng ký", §5 "Logout").
 *
 * ── Hai đường token, HAI HÀM riêng (p2-02) ──────────────────────────────────────────────────
 * `registerPushToken()` (FCM, ngay dưới) CHỈ dùng cho Android: `getDevicePushTokenAsync()` trả
 * token FCM trên Android nhưng trả token APNs THÔ trên iOS — mà BE gửi push thường bằng FCM
 * (`sendEachForMulticast`), không nhận token APNs thô. Đăng ký token APNs thô với `kind: 'FCM'`
 * là tệ hơn không đăng ký: BE sẽ thấy `invalid-registration-token` rồi thu hồi. Lý do kỹ thuật
 * này KHÔNG đổi dù `@react-native-firebase/messaging` giờ ĐÃ cài (p2-02, cho riêng đường push
 * cuộc gọi data-only) — gói đó không biến token APNs thô mà Expo trả về thành token FCM hợp lệ.
 *
 * `registerVoipPushToken()` (cuối file) là đường RIÊNG cho iOS: PushKit
 * (`react-native-voip-push-notification`, `features/calls/native/voip-push.ios.ts`) cấp một
 * token VoIP LUÔN hợp lệ trên iOS (không qua `getDevicePushTokenAsync()`), đăng ký với
 * `kind: 'APNS_VOIP'` — CHỈ dùng để đổ chuông cuộc gọi (be.md p2-02 §5.1: "không bao giờ gửi VoIP
 * cho loại khác `call.incoming`"), không thay thế cho push thường.
 */

/** Kết quả một lượt đăng ký — để hook ghi log/quyết định thử lại; không phải để hiện cho người dùng. */
export type PushRegisterOutcome =
  | 'already-registered'
  | 'failed'
  | 'no-permission'
  | 'no-token'
  | 'registered'
  | 'unsupported-platform';

/** Bản ghi đã đăng ký THÀNH CÔNG trong lần chạy app này — chống gọi lặp khi hook chạy lại (đổi trạng thái app, đổi quyền). */
let lastRegistered: { token: string; userId: string } | null = null;
/** Cùng vai trò với `lastRegistered` nhưng cho đường VoIP (`registerVoipPushToken`) — bộ đếm RIÊNG vì khác `kind`. */
let lastVoipRegistered: { token: string; userId: string } | null = null;
let inflight: Promise<PushRegisterOutcome> | null = null;

/** Trần thời gian cho `DELETE /me/devices/:id` lúc đăng xuất — xem `devicesService.remove`. */
const UNREGISTER_TIMEOUT_MS = 4000;

function deviceLocale(): string | undefined {
  try {
    // BE giới hạn 16 ký tự.
    return Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 16);
  } catch {
    return undefined;
  }
}

/**
 * Token FCM của máy này. `null` khi: không phải Android, Firebase chưa cấu hình
 * (thiếu `google-services.json` lúc build), hoặc máy không có Google Play Services.
 */
export async function getFcmToken(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return token.type === 'android' && typeof token.data === 'string' && token.data.length > 0
      ? token.data
      : null;
  } catch (error) {
    // Lỗi thường gặp: "Default FirebaseApp is not initialized" — build chưa có google-services.json.
    if (__DEV__) logger.warn('[push] không lấy được token FCM:', error);
    return null;
  }
}

async function postToken(userId: string, token: string): Promise<PushRegisterOutcome> {
  if (lastRegistered?.userId === userId && lastRegistered.token === token) {
    return 'already-registered';
  }
  try {
    await devicesService.register({
      appVersion: Application.nativeApplicationVersion ?? undefined,
      deviceId: await getDeviceId(),
      kind: 'FCM',
      locale: deviceLocale(),
      platform: 'ANDROID',
      token,
    });
    lastRegistered = { token, userId };
    return 'registered';
  } catch (error) {
    // Không đánh dấu đã đăng ký — lần kích hoạt kế tiếp (mở lại app / token đổi) sẽ thử lại.
    if (__DEV__) logger.warn('[push] đăng ký thiết bị thất bại:', error);
    return 'failed';
  }
}

/**
 * Đăng ký token hiện có của máy cho `userId`. Chỉ chạy khi quyền đã `granted` (PUSH-11: từ chối
 * quyền thì KHÔNG đăng ký, inbox + socket vẫn chạy). Single-flight — hai nơi kích hoạt cùng lúc
 * (bootstrap + AppState) chỉ sinh một request.
 *
 * Gọi ở MỖI lần app lên nền đăng nhập, không chỉ lần đầu: `POST` còn làm mới `lastSeenAt`,
 * và BE thu hồi token `lastSeenAt` quá `tokenStaleDays` (60 ngày).
 */
export function registerPushToken(userId: string): Promise<PushRegisterOutcome> {
  inflight ??= (async (): Promise<PushRegisterOutcome> => {
    if (Platform.OS !== 'android') return 'unsupported-platform';
    if ((await getPushPermission()) !== 'granted') return 'no-permission';
    const token = await getFcmToken();
    if (!token) return 'no-token';
    return postToken(userId, token);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Firebase báo token vừa xoay (`addPushTokenListener`) — đăng ký lại ngay, token cũ đã chết. */
export function registerRotatedToken(userId: string, token: string): Promise<PushRegisterOutcome> {
  if (Platform.OS !== 'android') return Promise.resolve('unsupported-platform');
  return postToken(userId, token);
}

/** Quên bản ghi "đã đăng ký" — sau đăng xuất/đổi tài khoản, lần đăng nhập kế phải POST lại. */
export function resetPushRegistration(): void {
  lastRegistered = null;
  lastVoipRegistered = null;
  inflight = null;
}

/**
 * Đăng ký token PushKit (VoIP) của iOS — `kind: 'APNS_VOIP'` (p2-02, gọi từ
 * `features/calls/native/voip-push.ios.ts` mỗi khi PushKit bắn sự kiện `register`). Tách khỏi `registerPushToken()`
 * ở trên: đường VoIP không đi qua `getDevicePushTokenAsync()`/`getPushPermission()` — token PushKit LUÔN hợp lệ trên
 * iOS, khác token APNs thô của push thường — nên không cần cùng bộ điều kiện single-flight `inflight`.
 *
 * Có dedupe RIÊNG (`lastVoipRegistered`, không dùng chung `lastRegistered` vì khác `kind`): PushKit bắn lại sự kiện
 * `register` mỗi lần gọi `registerVoipToken()` (kể cả token không đổi — xem README của gói), và bridge gọi lại hàm đó
 * mỗi khi `userId` đổi; không dedupe thì đổi tab/Fast Refresh sinh POST thừa liên tục.
 */
export async function registerVoipPushToken(
  userId: string,
  token: string,
): Promise<PushRegisterOutcome> {
  if (lastVoipRegistered?.userId === userId && lastVoipRegistered.token === token) {
    return 'already-registered';
  }
  try {
    await devicesService.register({
      appVersion: Application.nativeApplicationVersion ?? undefined,
      deviceId: await getDeviceId(),
      environment: __DEV__ ? 'SANDBOX' : 'PRODUCTION',
      kind: 'APNS_VOIP',
      locale: deviceLocale(),
      platform: 'IOS',
      token,
    });
    lastVoipRegistered = { token, userId };
    return 'registered';
  } catch (error) {
    if (__DEV__) logger.warn('[push] đăng ký token VoIP thất bại:', error);
    return 'failed';
  }
}

/**
 * Gỡ thiết bị này khỏi tài khoản đang đăng nhập (`DELETE /me/devices/:deviceId`) — bước đầu của
 * "logout wipe" (NT-07: máy dùng chung không nhận push của người cũ).
 *
 * Nuốt MỌI lỗi (trả `false`): đăng xuất không được kẹt vì mạng, và BE cũng tự gỡ theo `X-Device-Id`
 * ở `POST /auth/logout` — lời gọi này là lớp dự phòng khi lời gọi logout thất bại.
 * Gọi khi access token còn hiệu lực, TRƯỚC `authService.logout()`.
 */
export async function unregisterThisDevice(): Promise<boolean> {
  resetPushRegistration();
  try {
    await devicesService.remove(await getDeviceId(), {
      silent: true,
      timeoutMs: UNREGISTER_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}
