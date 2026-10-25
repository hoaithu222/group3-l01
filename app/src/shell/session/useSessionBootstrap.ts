import { useEffect, useRef, useState } from 'react';

import { appConfig } from '@/core/config/env.config';
import { useAuthStore } from '@/shell/store/slices/auth';

import { registerSessionWipe } from './register-session-wipe';
import { restoreSession } from './restore-session';
import { usePostLoginIntentCapture } from './use-post-login-intent-capture';

/**
 * ⛔ Đăng ký hàm dọn dữ liệu người dùng vào `onSessionEnded` ở TẦM MODULE, không phải trong
 * effect: `purgeSession()` có thể chạy ngay ở lượt khôi phục phiên đầu tiên (refresh trả 4xx),
 * TRƯỚC mọi effect của cây route. Xem `register-session-wipe.ts`.
 */
registerSessionWipe();

/**
 * Khôi phục phiên lúc khởi động app.
 *
 * ── Vì sao phải có bước này ──────────────────────────────────────────────────
 * Access token cố ý KHÔNG được lưu xuống ổ đĩa (xem `auth.config.ts`), nên sau khi đóng và mở
 * lại app thì trong bộ nhớ không còn token nào. Thứ còn lại là refresh token trong kho khoá hệ
 * điều hành. `restoreSession()` đổi nó lấy access token mới rồi lấy hồ sơ người dùng — logic
 * chi tiết (ba nhánh `ok`/`unauthenticated`/`unavailable`) ở `restore-session.ts`.
 *
 * Hook này lo phần React: chờ `AsyncStorage` nạp xong, chạy ĐÚNG MỘT LẦN, và báo khi đã đủ cơ sở
 * để quyết định điều hướng.
 */
export function useSessionBootstrap(): { isSessionReady: boolean } {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const status = useAuthStore((state) => state.status);

  /**
   * (P1) Quyết định khoá ứng dụng lúc mở lạnh đã chạy xong chưa — `isSessionReady` phải chờ CẢ cờ
   * này, không chỉ `hasHydrated`/`status`. Thiếu thì có một khung hình nội dung trang chủ hiện ra
   * TRƯỚC khi lớp phủ khoá kịp bật (`app.md` §3.4: "khoá TRƯỚC khi hạ splash").
   */
  const [biometricReady, setBiometricReady] = useState(false);

  /**
   * Chạy ĐÚNG MỘT LẦN mỗi vòng đời app. Dùng ref chứ không dựa vào mảng dependency: ở chế độ
   * nghiêm ngặt của React, effect chạy hai lần lúc phát triển, và hai lượt refresh song song lúc
   * khởi động là đúng thứ khiến backend xoay-vòng-token thu hồi cả phiên.
   */
  const started = useRef(false);

  /** Nhớ link ngắn mở lúc chưa đăng nhập để đăng nhập xong quay lại đúng đó (`post-login-intent`). */
  usePostLoginIntentCapture();

  useEffect(() => {
    // Phải đợi `AsyncStorage` nạp xong: chưa xong thì chưa biết có `user` đã lưu hay chưa, và ta sẽ
    // ghi đè lên nó.
    if (!hasHydrated || started.current) return;
    started.current = true;

    const boot = async (): Promise<void> => {
      try {
        // Tắt xác thực ⇒ không gọi gì cả (base xuất xưởng chưa có backend; gọi refresh chỉ tạo một
        // request đỏ ở MỖI lần mở app). ⚠️ Cố ý nằm TRONG hàm async: `react-hooks/set-state-in-effect`
        // chỉ cấm gọi setState ĐỒNG BỘ trong thân effect.
        if (!appConfig.authEnabled) useAuthStore.getState().setStatus('anonymous');
        else await restoreSession();
      } catch {
        // Lỗi ngoài dự kiến không được kẹt app ở màn hình chờ vĩnh viễn: coi như chưa có phiên
        // (refresh token, nếu còn, vẫn nằm nguyên trong kho khoá).
        useAuthStore.getState().setStatus('anonymous');
      } finally {
        setBiometricReady(true);
      }
    };

    void boot();
  }, [hasHydrated]);

  /**
   * Đã đủ cơ sở để quyết định điều hướng chưa. `app/_layout.tsx` giữ màn hình chờ tới khi cờ này
   * bật; thiếu điều kiện nào cũng ra màn đăng nhập nhấp nháy: `hasHydrated` (đã đọc xong
   * `AsyncStorage`), `status` đã rời `idle`/`restoring` (đã hỏi xong máy chủ), `biometricReady`.
   */
  return {
    isSessionReady: hasHydrated && status !== 'idle' && status !== 'restoring' && biometricReady,
  };
}
