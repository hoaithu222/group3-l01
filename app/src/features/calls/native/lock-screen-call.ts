import { DeviceEventEmitter, Platform, type EmitterSubscription } from 'react-native';

import { callNative, lockScreenCallNative } from './lock-screen-call.module';
import type { FullScreenIntentStatus, LockScreenLaunchCall } from './lock-screen-call.module';

/**
 * Cầu JS ↔ native module `LockScreenCall` (Android, `plugins/call-notification/`) — phần cuộc
 * gọi ĐẾN / màn khoá. Truy cập module và danh sách method nằm ở `lock-screen-call.module.ts`;
 * foreground service giữ cuộc gọi khi ra nền nằm ở `call-foreground-service.ts`.
 *
 * Mọi hàm tự no-op khi thiếu module (iOS, Expo Go, dev client cũ) và nuốt lỗi: đây là tính năng
 * PHỤ, không được phép kéo sập cuộc gọi.
 */

export type { FullScreenIntentStatus, LockScreenLaunchCall } from './lock-screen-call.module';

/** Tín hiệu native đẩy sang (`call.cancelled` · `call.answered-elsewhere` · `call.missed`…). */
export interface LockScreenCallSignal {
  callId: string;
  type: string;
}

const EVENT_SIGNAL = 'LockScreenCall.signal';

/** Dữ liệu cuộc gọi đang hiện trên màn khoá. `null` = không có / không phải Android. */
export async function getLockScreenLaunchCall(): Promise<LockScreenLaunchCall | null> {
  try {
    const launch = await lockScreenCallNative()?.getLaunchCall();
    return launch?.callId ? launch : null;
  } catch {
    return null;
  }
}

/**
 * Cuộc gọi ĐÃ TÀN → hạ chuông hệ thống + đóng màn gọi.
 *
 * ⛔ **Luôn truyền `callId`.** Không có nó, một tín hiệu TRỄ của cuộc CŨ sẽ hạ chuông của cuộc
 * ĐANG reo; trong gọi nhóm thì người khác bấm Từ chối là chuông máy mình tắt theo. Native tự
 * đối chiếu với `ringingCallId` và bỏ qua nếu lệch.
 *
 * ⛔ KHÔNG dùng cho ca "không dựng lại được UI" — xem {@link closeLockScreenCallScreen}.
 */
export function dismissLockScreenCall(callId?: string | null): void {
  callNative((native) => native.dismiss(callId ?? null));
}

/**
 * Thôi ĐỔ CHUÔNG nhưng **GIỮ màn gọi đang mở**.
 *
 * Dùng khi người dùng bấm Nghe NGAY TRÊN MÀN KHOÁ: chuông phải tắt, nhưng `dismiss` thì đóng
 * luôn `IncomingCallActivity` — tức giết đúng cuộc gọi vừa nhận. Cây `main` (vẫn sống khi app
 * chạy nền) trước đây gọi `dismiss` ở pha `connecting` và làm đúng chuyện đó.
 */
export function stopLockScreenRinging(callId?: string | null): void {
  callNative((native) => native.stopRinging(callId ?? null));
}

/**
 * Đóng màn gọi nhưng **GIỮ thông báo trên khay** — dùng cho các nhánh chỉ có nghĩa "tôi không
 * dựng lại được màn gọi" (mất mạng, phiên chưa khôi phục xong, thiếu `callId`). Gộp chung vào
 * `dismiss` thì máy khoá + mạng chập là chuông biến mất khỏi khay, người dùng không còn gì để bấm.
 */
export function closeLockScreenCallScreen(): void {
  callNative((native) => native.closeScreen());
}

/**
 * Báo native "trong app đang có đường hiện cuộc gọi". `CallPushReceiver` chỉ bỏ qua
 * `call.incoming` khi app ở tiền cảnh **và** cờ này bật — chưa đăng nhập / JS đang boot thì
 * `CallHost` không mount, native phải dựng thông báo thay vì im lặng.
 */
export function setCallUiReady(ready: boolean): void {
  callNative((native) => native.setCallUiReady(ready));
}

/**
 * Báo native "JS đã cầm cuộc gọi" ⇒ native thôi tự đóng màn. ⛔ Bắt buộc bật khi nhận cuộc:
 * push `call.answered-elsewhere` là echo của chính máy này vừa bấm Nghe.
 */
export function setLockScreenCallHold(active: boolean): void {
  callNative((native) => native.setHoldActive(active));
}

/** `userId` đang đăng nhập — receiver dùng để bỏ push gửi nhầm chủ máy (token FCM chưa thu hồi). */
export function setLockScreenCallUser(userId: string | null): void {
  callNative((native) => native.setCurrentUser(userId));
}

/** Notification cuộc gọi có đang đổ chuông hệ thống không — JS không được reo chồng lên nó. */
export async function isNativeRingActive(): Promise<boolean> {
  try {
    return (await lockScreenCallNative()?.isNativeRingActive()) ?? false;
  } catch {
    return false;
  }
}

/** Quyền "Thông báo toàn màn hình" (Android 14+) — xem `full-screen-intent.ts`. */
export async function fullScreenIntentStatus(): Promise<FullScreenIntentStatus> {
  try {
    return (await lockScreenCallNative()?.canUseFullScreenIntent()) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Nghe tín hiệu cuộc gọi do native đẩy sang.
 *
 * Vì sao cần: root trên màn khoá có thể là JS DUY NHẤT đang sống (app đã bị vuốt tắt) và chưa
 * kịp nối socket — không có cầu này thì cuộc gọi bị bên kia huỷ sẽ không ai biết.
 */
export function onLockScreenCallSignal(
  handler: (signal: LockScreenCallSignal) => void,
): EmitterSubscription | null {
  if (Platform.OS !== 'android') return null;
  return DeviceEventEmitter.addListener(EVENT_SIGNAL, handler);
}
