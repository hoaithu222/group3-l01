import { useRef, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { disableBiometric, useBiometricStore } from '@/shell/store/slices/biometric';
import { useAuthStore } from '@/shell/store/slices/auth';

import { BIOMETRIC_ENABLE_REQUIRES_NETWORK } from '../constants/biometric.messages';
import { performBiometricEnroll } from './perform-biometric-enroll';

/**
 * Bật/tắt đăng nhập sinh trắc học từ màn Cài đặt (`app.md` §3.2, §4).
 *
 * Chỉ lo phần STATE React (đang bật/tắt, lỗi hiện dưới ô) — toàn bộ chuỗi
 * nghiệp vụ BẬT nằm ở `perform-biometric-enroll.ts` (tách để giữ file này
 * dưới trần 150 dòng, xem chú thích ở đó).
 */

interface EnableResult {
  ok: boolean;
}

export function useBiometricEnrollment() {
  const user = useAuthStore((state) => state.user);
  const binding = useBiometricStore((state) => state.binding);

  /**
   * ⛔ Chống bật CHỒNG. `isEnabling` cập nhật bất đồng bộ nên bàn phím "Xong" hai lần liền vẫn lọt
   * hai lượt `enable`: hai credential được tạo, cái đầu mồ côi (ACTIVE phía BE mà máy không giữ bí mật
   * của nó) và iOS hiện hai hộp quét. Cờ `ref` đổi ĐỒNG BỘ.
   */
  const enablingRef = useRef(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  /** Lỗi hiện DƯỚI Ô MẬT KHẨU trong sheet — KHÔNG phải lỗi mạng (đó là toast). */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEnabled = Boolean(binding && user && binding.userId === user.id);

  function clearError(): void {
    setErrorMessage(null);
  }

  async function enable(password: string): Promise<EnableResult> {
    if (!user || enablingRef.current) return { ok: false };

    enablingRef.current = true;
    setIsEnabling(true);
    setErrorMessage(null);

    try {
      const outcome = await performBiometricEnroll(user, password);

      if (outcome.ok) return { ok: true };

      if (outcome.kind === 'network') {
        // Mất mạng/timeout không liên quan gì tới mật khẩu — báo bằng toast
        // riêng, không phải lỗi field dưới ô.
        showToast('error', BIOMETRIC_ENABLE_REQUIRES_NETWORK);
      } else {
        setErrorMessage(outcome.message);
      }
      return { ok: false };
    } finally {
      enablingRef.current = false;
      setIsEnabling(false);
    }
  }

  async function disable(): Promise<void> {
    setIsDisabling(true);
    try {
      await disableBiometric('USER_DISABLED');
    } finally {
      setIsDisabling(false);
    }
  }

  return { clearError, disable, enable, errorMessage, isEnabled, isEnabling, isDisabling };
}
