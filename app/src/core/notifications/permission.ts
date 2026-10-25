import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { ensureAndroidChannels } from './android-channels';

/**
 * Quyền thông báo của hệ điều hành (p0-06 `app.md` §3, PUSH-11).
 *
 *  · `granted`      — được phép hiện thông báo (iOS: kể cả "tạm thời/provisional").
 *  · `undetermined` — chưa từng hỏi. Chỉ trạng thái này mới hỏi được bằng hộp thoại hệ thống.
 *  · `denied`       — đã từ chối. Hỏi lại KHÔNG hiện gì (Android: sau hai lần từ chối; iOS: một
 *                     lần) — lối duy nhất là đưa người dùng tới Cài đặt hệ thống.
 */
export type PushPermissionState = 'denied' | 'granted' | 'undetermined';

interface PermissionLike {
  canAskAgain: boolean;
  granted: boolean;
  ios?: { status: number };
}

/**
 * Hàm thuần — tách khỏi lời gọi native để test được từng ca (đặc biệt ca iOS provisional).
 *
 * ⚠️ Không suy từ `status` của expo (`'granted' | 'denied' | 'undetermined'`): iOS
 * `PROVISIONAL`/`EPHEMERAL` báo `granted: false` ở vài phiên bản dù thông báo vẫn hiện.
 * Đọc `ios.status` trực tiếp (`IosAuthorizationStatus.PROVISIONAL = 3`, `EPHEMERAL = 4`).
 */
export function toPermissionState(permission: PermissionLike): PushPermissionState {
  if (permission.granted) return 'granted';
  const iosStatus = permission.ios?.status;
  if (iosStatus === 3 || iosStatus === 4) return 'granted';
  // `canAskAgain=false` mà chưa granted = đã từ chối vĩnh viễn. Android chưa hỏi lần nào báo
  // `canAskAgain=true`, iOS chưa hỏi báo `ios.status = NOT_DETERMINED (0)`.
  if (!permission.canAskAgain) return 'denied';
  if (iosStatus === 1) return 'denied';
  return 'undetermined';
}

/** Đọc trạng thái hiện tại. Không có tác dụng người dùng thấy được, gọi tự do. */
export async function getPushPermission(): Promise<PushPermissionState> {
  try {
    return toPermissionState(await Notifications.getPermissionsAsync());
  } catch {
    // Không đọc được quyền (module native lỗi) ≠ "đã từ chối" — coi như chưa hỏi để không
    // hiện nhầm "Đang tắt trong Cài đặt hệ thống".
    return 'undetermined';
  }
}

/**
 * Hiện hộp thoại xin quyền của HỆ ĐIỀU HÀNH. Chỉ gọi khi người dùng vừa bấm "Bật" ở primer
 * hoặc ở Cài đặt thông báo — ⛔ không gọi lúc mở app/onboarding (`app.md` §3, §7).
 *
 * Chỉ hỏi khi còn `undetermined`; đã `denied` thì trả nguyên trạng thái, để nơi gọi chuyển
 * sang `openNotificationSettings()` thay vì tưởng hộp thoại đã hiện.
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  const current = await getPushPermission();
  if (current !== 'undetermined') return current;

  // Android 13+: hộp thoại chỉ hiện khi đã có ít nhất một kênh — xem `ensureAndroidChannels`.
  await ensureAndroidChannels();
  try {
    return toPermissionState(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    );
  } catch {
    return 'undetermined';
  }
}

/** Mở màn Cài đặt thông báo của hệ điều hành cho app này. Trả `false` khi không mở được. */
export async function openNotificationSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
