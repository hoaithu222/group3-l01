import { PermissionsAndroid, Platform } from 'react-native';

/** Đã hỏi trong lần mở app này chưa — từ chối thì không hỏi lại mỗi lần vào phòng (Android tự nhớ "Không hỏi lại"). */
let asked = false;

/**
 * Android 12+ (API 31): quyền RUNTIME `BLUETOOTH_CONNECT` ("Thiết bị ở gần"). Thiếu nó thì `AudioSwitch` của LiveKit không thấy tai nghe
 * Bluetooth ⇒ tiếng cuộc gọi/họp ra loa máy dù người dùng đang đeo tai nghe. Khai trong manifest (`app.config.ts`) là CHƯA đủ.
 *
 * Gọi TRƯỚC khi bật phiên âm thanh (`AudioSwitch` chỉ dò Bluetooth lúc khởi động). Không bao giờ chặn việc vào phòng/cuộc gọi: từ chối thì
 * vẫn vào, chỉ không định tuyến được Bluetooth. Không ném. iOS/Android ≤ 11: không cần quyền này ⇒ `true`.
 *
 * ⚠️ CHƯA XÁC MINH trên máy Android 12+ thật (hộp thoại "Thiết bị ở gần" + tai nghe Bluetooth).
 */
export async function ensureBluetoothAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (await PermissionsAndroid.check(permission)) return true;
    if (asked) return false;
    asked = true;
    return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Chỉ cho test: quên lượt đã hỏi. */
export function resetBluetoothPermissionForTests(): void {
  asked = false;
}
