import { useCallback, useEffect, useRef } from 'react';

import { useCapabilities } from '@/shell/capabilities';
import { wasExplicitLogout } from '@/shell/session/logout-intent';
import { useAppActive } from '@/shared/hooks/useAppActive';

/** Chờ màn hình "ổn định" (hết hoạt ảnh chuyển màn) trước khi hiện hộp quét. */
const AUTO_PROMPT_DELAY_MS = 600;

/** Mặc định khi `/capabilities` chưa trả khối `auth` — khớp `LIMITS.auth.appLock.lockAfterBackgroundSeconds` mặc định phía BE. */
const DEFAULT_REARM_AFTER_BACKGROUND_SECONDS = 300;

/**
 * Tự bật hộp quét sinh trắc học ở màn Đăng nhập — ĐÚNG MỘT LẦN mỗi lượt vào
 * màn, và không lặp lại một cách phiền toái.
 *
 * ── Ba điều kiện phải hội đủ, xem `app.md` §3.3/§4/§7 ────────────────────────
 *   1. `available` — đã gắn kết + máy dùng được + email khớp (đọc từ `useBiometricLogin`).
 *   2. Chưa "dùng lượt" của phiên vào-màn hiện tại (`usedRef`).
 *   3. `!wasExplicitLogout()` — KHÔNG tự bật ngay sau khi người dùng vừa chủ
 *      động bấm "Đăng xuất" (họ có thể đang muốn đổi tài khoản).
 *
 * ── Vì sao đánh dấu "đã dùng" NGAY LÚC HẸN GIỜ CHẠY, không đợi lúc BẤM ────────
 * Nếu đợi tới khi `trigger()` thực sự resolve mới đánh dấu, một cú bấm TAY của
 * người dùng đúng lúc bộ đếm 600ms cũng vừa hết sẽ kích hoạt HAI hộp quét gần
 * như đồng thời — Android ném lỗi "Authentication is already in progress" cho
 * lượt thứ hai. Đánh dấu trước khi gọi biến "đã dùng" thành một cái CHỐT, và
 * `claim()` cho phép nơi gọi (nút bấm tay) giành chốt đó SỚM HƠN, trước cả khi
 * bộ đếm kịp chạy.
 *
 * ── Nạp lại lượt: chỉ khi app ở NỀN đủ lâu ───────────────────────────────────
 * `inactive → active` (hộp Face ID của iOS tự đóng/mở) KHÔNG được nạp lại —
 * nếu không, mỗi lần hộp quét tự đóng (kể cả do chính lượt tự động này gây ra)
 * lại kích hoạt thêm một lượt tự động MỚI, thành vòng lặp hộp quét vô tận.
 */
export function useAutoBiometricPrompt(
  available: boolean,
  trigger: (prompt?: string) => Promise<void>,
): { claim: () => void } {
  const usedRef = useRef(false);
  const appState = useAppActive();
  const backgroundedAtRef = useRef<number | null>(null);

  const { data: capabilities } = useCapabilities();
  const rearmAfterSeconds =
    capabilities?.auth?.appLock?.lockAfterBackgroundSeconds ?? DEFAULT_REARM_AFTER_BACKGROUND_SECONDS;

  const claim = useCallback(() => {
    usedRef.current = true;
  }, []);

  // Theo dõi thời lượng ở nền để quyết định có "nạp lại lượt" hay không.
  useEffect(() => {
    if (appState === 'background') {
      backgroundedAtRef.current = Date.now();
      return;
    }
    if (appState === 'active' && backgroundedAtRef.current !== null) {
      const elapsedSeconds = (Date.now() - backgroundedAtRef.current) / 1000;
      backgroundedAtRef.current = null;
      if (elapsedSeconds >= rearmAfterSeconds) usedRef.current = false;
    }
    // 'inactive' bị bỏ qua CÓ CHỦ ĐÍCH — xem chú thích đầu file.
  }, [appState, rearmAfterSeconds]);

  useEffect(() => {
    if (!available || usedRef.current || wasExplicitLogout()) return undefined;

    const timer = setTimeout(() => {
      // Giữa lúc chờ, người dùng có thể đã tự bấm nút (giành chốt qua `claim()`).
      if (usedRef.current) return;
      usedRef.current = true;
      void trigger();
    }, AUTO_PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
    /**
     * ⛔ `appState` PHẢI có mặt ở đây, dù thân effect không đọc nó trực tiếp.
     *
     * Đây là effect DUY NHẤT thực sự đặt `setTimeout`. Effect theo dõi nền/tiền
     * cảnh ở trên chỉ ĐẶT LẠI `usedRef.current = false` khi đủ ngưỡng — bản
     * thân việc đặt một biến ref KHÔNG kích hoạt effect nào chạy lại. Thiếu
     * `appState` trong deps thì "nạp lại lượt" chỉ có tác dụng ở lần MOUNT tiếp
     * theo (màn hình bị huỷ rồi dựng lại thật sự), chứ không có tác dụng ngay
     * khi người dùng quay lại màn Đăng nhập đang đứng yên — đúng ca hay gặp
     * nhất (chuyển sang app khác rồi quay lại, không phải tắt hẳn app).
     *
     * Cả hai effect cùng đọc/ghi `appState` nên luôn chạy CÙNG một lượt commit
     * và ĐÚNG THỨ TỰ khai báo (effect theo dõi nền chạy trước, cập nhật
     * `usedRef` xong thì effect này mới đọc lại giá trị mới).
     */
  }, [available, trigger, appState]);

  return { claim };
}
