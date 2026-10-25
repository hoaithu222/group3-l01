import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';

import { fullScreenIntentStatus } from './lock-screen-call';

/**
 * Quyền "Thông báo toàn màn hình" của Android 14+ — điều kiện để màn gọi BUNG RA khi máy đang
 * khoá, thay vì chỉ là một banner.
 *
 * ⚠️ Khai `USE_FULL_SCREEN_INTENT` trong manifest KHÔNG còn đủ từ API 34: hệ thống mặc định TỪ
 * CHỐI, chỉ tự cấp cho app có chức năng cốt lõi là gọi điện/báo thức. Bị từ chối thì
 * `setFullScreenIntent` âm thầm tụt xuống heads-up — không lỗi, không log, chỉ là màn gọi không
 * hiện. App đang `targetSdkVersion` 35+ nên chắc chắn dính.
 *
 * ℹ️ Kể cả ĐÃ cấp, Android vẫn chỉ bung toàn màn hình khi **máy đang khoá / màn hình tắt**. Máy
 * đang dùng dở thì hệ thống cố ý hạ xuống heads-up — đúng tài liệu. Test phải khoá màn hình.
 */

/** Mốc lần mời gần nhất (ms). */
const ASKED_KEY = 'calls.full-screen-intent-asked-at';

/**
 * Khoảng cách giữa hai lần mời. KHÔNG mời một lần rồi thôi vĩnh viễn: quyền này quyết định
 * chuông có bung ra khi máy khoá hay không, mà người dùng rất dễ bấm "Để sau" ở lần đầu rồi kẹt
 * luôn. Một tuần một lần đủ để cứu, không đủ để phiền.
 */
const REASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** API 34 = Android 14 — mốc siết quyền. */
const ANDROID_14 = 34;

/**
 * Trang Cài đặt "Thông báo toàn màn hình". Data URI `package:` để nhảy thẳng vào app là TUỲ CHỌN
 * theo tài liệu Android, mà `Linking.sendIntent` lại không gửi được data URI — nên mở trang
 * chung, người dùng tự chọn app trong danh sách.
 */
const FULL_SCREEN_SETTINGS = 'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT';

async function openSettings(): Promise<void> {
  try {
    await Linking.sendIntent(FULL_SCREEN_SETTINGS);
  } catch {
    // ROM tuỳ biến không có trang đó → về trang thông tin app.
    await Linking.openSettings().catch(() => undefined);
  }
}

/**
 * Mời bật quyền, tối đa mỗi {@link REASK_AFTER_MS} một lần. Gọi NỐI ĐUÔI luồng xin quyền thông
 * báo sẵn có (`PushPrimerHost`), không đẻ thêm một lần ngắt riêng.
 *
 * Đã cấp rồi thì im. `unknown` (bản dựng chưa link native module) VẪN mời — đó chính là bản dễ
 * thiếu quyền nhất.
 */
export async function promptFullScreenIntentOnce(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < ANDROID_14) return;
  if ((await fullScreenIntentStatus()) === 'granted') return;

  const askedAt = Number((await AsyncStorage.getItem(ASKED_KEY)) ?? 0);
  if (askedAt && Date.now() - askedAt < REASK_AFTER_MS) return;
  await AsyncStorage.setItem(ASKED_KEY, String(Date.now()));

  Alert.alert(
    'Hiện cuộc gọi khi màn hình khoá',
    'Android cần bạn bật riêng "Thông báo toàn màn hình" cho ứng dụng. Chưa bật thì cuộc gọi đến chỉ hiện thông báo nhỏ, không bung màn hình khi máy đang khoá.',
    [
      { style: 'cancel', text: 'Để sau' },
      { onPress: () => void openSettings(), text: 'Mở cài đặt' },
    ],
  );
}
