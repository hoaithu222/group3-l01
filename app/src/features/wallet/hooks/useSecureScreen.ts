import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Chặn chụp/ghi màn hình khi màn đang hiện SỐ TÀI KHOẢN đầy đủ (màn Trả nợ, Tài khoản nhận
 * tiền — app.md §6). Android: `FLAG_SECURE` (ảnh chụp đen, ghi hình đen, thumbnail app-switcher
 * trống). Đây là lớp giảm thiểu chứ không phải bảo mật tuyệt đối: người khác vẫn chụp bằng máy
 * thứ hai được.
 *
 * ⚠️ KHÔNG chặn được trên iOS — cố ý bật Android-only thay vì gọi `usePreventScreenCapture` cho
 * cả hai: hook đó không cho gắn điều kiện nền tảng (Rules of Hooks), còn hành vi iOS của thư viện
 * (che khi đang ghi màn hình) khác hẳn nên không thể hứa cùng một mức bảo vệ trong tài liệu.
 * `key` để hai màn cùng bật không "mở khoá" lẫn nhau khi một màn thoát trước.
 */
export function useSecureScreen(key: string): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    // `.catch`: bật/tắt cờ bảo mật là lớp giảm thiểu — thất bại không được thành Promise reject vô chủ.
    Promise.resolve(preventScreenCaptureAsync(key)).catch(() => undefined);
    return () => {
      Promise.resolve(allowScreenCaptureAsync(key)).catch(() => undefined);
    };
  }, [key]);
}
