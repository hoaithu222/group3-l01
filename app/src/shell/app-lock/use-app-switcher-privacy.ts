import {
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
} from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Làm mờ nội dung app trong BỘ CHUYỂN ỨNG DỤNG (app switcher) và ảnh chụp nền của hệ điều hành.
 *
 * ── Vì sao có file này ───────────────────────────────────────────────────────
 * Lớp phủ khoá (`AppLockOverlay`) chỉ hiện khi quay lại sau ≥ `lockAfterBackgroundSeconds`. Trong
 * suốt khoảng đó — và trong lúc app vừa `inactive`/`background` — ảnh chụp mà hệ điều hành lưu cho
 * app switcher là ĐÚNG màn hình đang mở (tin nhắn, số tiền, danh sách công việc). Người cầm máy
 * mở app switcher là đọc được, không cần mở khoá.
 *
 * `expo-screen-capture` làm việc này ở tầng NATIVE (iOS làm mờ khi app rời `active`, gỡ khi quay
 * lại) nên đáng tin hơn một lớp phủ vẽ bằng JS: JS chỉ biết app rời `active` SAU khi hệ điều hành
 * đã chụp xong ảnh.
 *
 * ⚠️ CHỈ iOS. Android cũng chụp ảnh nền cho màn hình "gần đây", nhưng cách DUY NHẤT ẩn nó là
 * `FLAG_SECURE` — cờ đó chặn LUÔN chụp/ghi màn hình toàn app (`preventScreenCaptureAsync`), và bật
 * nó trong `AppState` change thì tới muộn hơn lúc hệ điều hành chụp. Đó là quyết định sản phẩm
 * (người dùng có được chụp màn hình app không), không phải chi tiết kỹ thuật — chưa bật; ví
 * (`useSecureScreen`) vẫn tự bật riêng cho màn số tài khoản.
 */
const BLUR_INTENSITY = 1;

/** `active` = đang có phiên + đã bật khoá ứng dụng (đăng nhập sinh trắc học). Tắt thì gỡ làm mờ. */
export function useAppSwitcherPrivacy(active: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    // Module native lỗi/thiếu (Expo Go bản cũ) không được làm hỏng cả app.
    const call = (enable: boolean) =>
      (enable
        ? enableAppSwitcherProtectionAsync(BLUR_INTENSITY)
        : disableAppSwitcherProtectionAsync()
      ).catch(() => undefined);

    void call(active);
    return () => {
      void call(false);
    };
  }, [active]);
}
