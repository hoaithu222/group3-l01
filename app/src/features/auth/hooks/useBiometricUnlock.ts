import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useRef, useState } from 'react';

import { useAppLockStore } from '@/shell/app-lock';

import {
  APP_LOCK_LOCKOUT_HINT,
  APP_LOCK_NOT_ENROLLED_HINT,
  BIOMETRIC_UNLOCK_PROMPT,
} from '../constants/biometric.messages';

/**
 * Mở khoá ứng dụng (P1) bằng sinh trắc học HOẶC MÃ MÁY — KHÔNG chạm mạng, KHÔNG
 * đọc bí mật trong kho khoá.
 *
 * ── Khác hẳn `useBiometricLogin` — đọc kỹ trước khi "gộp cho gọn" ────────────
 * Đây là một CỔNG CỤC BỘ trên một phiên đăng nhập VẪN CÒN SỐNG (access token
 * còn hiệu lực trong bộ nhớ) — mục đích chỉ là xác nhận "đúng người đang cầm
 * máy", không phải xin lại quyền truy cập. Vì vậy nó gọi thẳng
 * `LocalAuthentication.authenticateAsync` (hộp quét CỦA HỆ ĐIỀU HÀNH, chấp
 * nhận cả mã khoá máy nếu sinh trắc học thất bại — `disableDeviceFallback`
 * mặc định `false`), không đụng tới `biometric-vault.ts`
 * (`readSecret`/`computeBiometricHmac`/`authService.biometricLogin`).
 *
 * Hệ quả TÍCH CỰC: mở khoá được cả khi MẤT MẠNG (`app.md` BIO-18) — không có
 * lượt gọi API nào ở đây để mất mạng làm hỏng.
 */
export interface UseBiometricUnlockResult {
  isPending: boolean;
  errorMessage: string | null;
  unlock: () => Promise<void>;
}

export function useBiometricUnlock(): UseBiometricUnlockResult {
  const runningRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: BIOMETRIC_UNLOCK_PROMPT,
      });

      if (result.success) {
        useAppLockStore.getState().unlock();
        return;
      }

      switch (result.error) {
        case 'user_cancel':
        case 'system_cancel':
        case 'app_cancel':
          // Huỷ quét — im lặng, giữ nguyên lớp phủ khoá.
          break;
        case 'lockout':
          setErrorMessage(APP_LOCK_LOCKOUT_HINT);
          break;
        case 'not_enrolled':
        case 'not_available':
        case 'passcode_not_set':
          setErrorMessage(APP_LOCK_NOT_ENROLLED_HINT);
          break;
        default:
          setErrorMessage(APP_LOCK_LOCKOUT_HINT);
      }
    } catch {
      // Module native lỗi lạ (không nên xảy ra — capability đã kiểm trước khi
      // hiện nút) — coi như thất bại thường, không làm sập lớp phủ khoá.
      setErrorMessage(APP_LOCK_LOCKOUT_HINT);
    } finally {
      runningRef.current = false;
      setIsPending(false);
    }
  }, []);

  return { errorMessage, isPending, unlock };
}
