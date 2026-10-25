import { useCallback, useRef, useState } from 'react';

import { computeBiometricHmac, readSecret, type BiometricCapability } from '@/core/auth/biometric';
import { authService } from '@/core/api/auth';
import { isNonceRejected } from '@/core/api/auth/auth.nonce';
import { getDeviceId } from '@/core/device/device-id';
import { useCapabilities } from '@/shell/capabilities';
import { completeSignIn } from '@/shell/session/sign-in';
import { useBiometricStore } from '@/shell/store/slices/biometric';
import type { BiometricBinding } from '@/shell/store/slices/biometric';
import { useBiometricCapability } from '@/shared/hooks/useBiometricCapability';

import { BIOMETRIC_LOGIN_PROMPT } from '../constants/biometric.messages';
import { resolveBiometricLoginError } from './resolve-biometric-login-error';

/**
 * Đăng nhập bằng sinh trắc học.
 *
 * ── Luồng, ĐÚNG THỨ TỰ (app.md §3.3, đã đổi theo hợp đồng nonce/HMAC) ─────────
 *   1. `readSecret(prompt)`            — hệ điều hành hiện hộp quét, đọc bí mật.
 *   2. `authService.fetchNonce()`      — lấy mã dùng một lần MỚI.
 *   3. `computeBiometricHmac(secret, nonce)` — tính CỤC BỘ, không gửi `secret` đi.
 *   4. `authService.biometricLogin({credentialId, deviceId, nonce, hmac})`.
 *   5. `completeSignIn(session, { method: 'BIOMETRIC' })`.
 *
 * ⛔ Biến `secret` (bước 1) CHỈ sống trong khối `try` của `trigger`, chỉ được
 * đưa vào `computeBiometricHmac()` ở bước 3, và KHÔNG BAO GIỜ:
 *   · được `console.log`/đưa vào bất kỳ lời gọi log nào;
 *   · được gán vào state, ref, hay bất kỳ object nào tồn tại LÂU HƠN lệnh gọi
 *     hàm này (không set vào `useState`, không đưa vào object trả về của hook);
 *   · được đưa vào payload gửi cho `authService.biometricLogin` — payload đó
 *     chỉ có `nonce` + `hmac`, không có `secret`.
 */

export interface UseBiometricLoginResult {
  /**
   * Có nên HIỆN nút sinh trắc học không — `app.md` §4:
   * đã gắn kết + máy dùng được + (ô email đang trống HOẶC trùng email đã gắn).
   */
  available: boolean;
  /** Khả năng sinh trắc học hiện tại — `undefined` khi chưa tải xong. Đưa thẳng vào `<BiometricLoginButton capability={...}>`. */
  capability: BiometricCapability | undefined;
  isPending: boolean;
  /** Câu lỗi tiếng Việt cần hiện trong dải `Alert` của form — `null` khi không có lỗi/huỷ im lặng. */
  errorMessage: string | null;
  /** Gọi khi người dùng bấm nút, hoặc khi tự bật hộp quét lúc vào màn. */
  trigger: (prompt?: string) => Promise<void>;
  /** Xoá `errorMessage` — gọi khi người dùng bắt đầu sửa lại ô nhập. */
  clearError: () => void;
}

export function useBiometricLogin(typedEmail?: string): UseBiometricLoginResult {
  const binding = useBiometricStore((state) => state.binding);
  const { data: capability } = useBiometricCapability();
  const { data: capabilities } = useCapabilities();

  // ⛔ Chặn chồng lượt — bấm nút TỰ ĐỘNG rồi bấm TAY gần như đồng thời (hoặc
  // bấm tay hai lần liên tiếp) không được mở HAI hộp quét cùng lúc, Android
  // sẽ ném lỗi "Authentication is already in progress" cho lượt thứ hai.
  const runningRef = useRef(false);

  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Công tắc phía BE (`SystemConfig auth.biometricLogin.enabled`, `app.md` §4:
   * "useCapabilities().auth.biometricLogin.enabled === false ⇒ ẩn hàng Cài
   * đặt + nút Đăng nhập"). `undefined` (chưa tải capabilities, hoặc BE cũ chưa
   * trả khối `auth`) mặc định coi là BẬT — ⛔ đừng đảo ngược mặc định này:
   * capabilities luôn tải lại được lúc mất mạng, còn coi "chưa biết" là "tắt"
   * sẽ khiến nút biến mất mỗi lần mở app trong lúc capabilities còn đang tải.
   */
  const biometricLoginEnabled = capabilities?.auth?.biometricLogin?.enabled ?? true;

  const normalizedTypedEmail = typedEmail?.trim().toLowerCase();
  const available =
    biometricLoginEnabled &&
    Boolean(binding) &&
    Boolean(capability?.isUsable) &&
    (!normalizedTypedEmail || normalizedTypedEmail === binding?.email.toLowerCase());

  const clearError = useCallback(() => setErrorMessage(null), []);

  const trigger = useCallback(async (prompt: string = BIOMETRIC_LOGIN_PROMPT) => {
    // Đọc TẠI THỜI ĐIỂM GỌI, không dùng biến `binding` đóng gói ở scope ngoài —
    // `trigger` có thể được `useAutoBiometricPrompt` giữ tham chiếu qua nhiều
    // lượt render, và biến đóng gói cũ có thể trỏ tới một binding đã bị gỡ.
    const currentBinding: BiometricBinding | null = useBiometricStore.getState().binding;
    if (runningRef.current || !currentBinding) return;

    runningRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const secret = await readSecret(prompt);
      const deviceId = await getDeviceId();

      // Nonce dùng MỘT LẦN, lấy MỚI mỗi lượt gửi. BE từ chối nonce (`AUTH_018`: hết hạn/đã dùng)
      // thì lấy nonce khác và gửi lại ĐÚNG MỘT LẦN với CHÍNH `secret` đang có trong tay — không
      // bắt người dùng quét vân tay/Face ID lần hai chỉ vì một cú chập mạng.
      const attempt = async () => {
        const nonce = await authService.fetchNonce();
        return authService.biometricLogin({
          credentialId: currentBinding.credentialId,
          deviceId,
          nonce,
          hmac: computeBiometricHmac(secret, nonce),
        });
      };
      let session;
      try {
        session = await attempt();
      } catch (error) {
        if (!isNonceRejected(error)) throw error;
        session = await attempt();
      }

      await completeSignIn(session, { method: 'BIOMETRIC' });
    } catch (error) {
      const label = capability?.label ?? currentBinding.kind ?? 'sinh trắc học';
      const message = await resolveBiometricLoginError(error, label);
      setErrorMessage(message);
    } finally {
      runningRef.current = false;
      setIsPending(false);
    }
    // ⛔ `binding` KHÔNG nằm trong deps CÓ CHỦ Ý: hàm luôn đọc giá trị MỚI NHẤT
    // trực tiếp từ store ngay trong thân (`useBiometricStore.getState()`), nên
    // đưa `binding` (biến đã lấy qua `useBiometricStore(selector)` ở trên) vào
    // đây chỉ tạo thêm một bản `trigger` mới mỗi lần binding đổi mà không đổi
    // hành vi gì. `capability?.label` thì CÓ ảnh hưởng tới câu lỗi hiển thị nên
    // phải khai đủ.
  }, [capability?.label]);

  return { available, capability, clearError, errorMessage, isPending, trigger };
}
