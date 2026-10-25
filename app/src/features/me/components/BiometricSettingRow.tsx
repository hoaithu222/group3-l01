import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { useBiometricCapability } from '@/shared/hooks/useBiometricCapability';
import { useCapabilities } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { BiometricEnrollSheet } from './BiometricEnrollSheet';
import { MeToggleRow } from './MeToggleRow';
import {
  biometricAccountContext,
  biometricFeatureLabel,
  biometricUnusableGuidance,
} from '../constants/biometric.messages';
import { useBiometricEnrollment } from '../hooks/useBiometricEnrollment';

/**
 * Hàng "Đăng nhập bằng {nhãn}" trong card "Bảo mật" của màn Cài đặt (`app.md`
 * §3, hàng "Cài đặt").
 *
 * ⛔ Máy KHÔNG có cảm biến vật lý ⇒ hàng này KHÔNG RENDER GÌ CẢ (kể cả khung
 * rỗng) — khác với "có cảm biến nhưng `isUsable=false`", lúc đó hàng VẪN hiện
 * để hướng dẫn người dùng đi bật/sửa trong Cài đặt máy. Cùng lý do ẩn hoàn
 * toàn khi BE tắt công tắc `auth.biometricLogin.enabled` (`app.md` §4) — tắt
 * ở BE nghĩa là tính năng đang ngừng phục vụ CHO MỌI NGƯỜI, không phải "máy
 * này không dùng được" (đó mới là ca hiện hàng + hướng dẫn).
 */
export function BiometricSettingRow() {
  const { data: capability } = useBiometricCapability();
  const { data: capabilities } = useCapabilities();
  const email = useAuthStore((state) => state.user?.email ?? '');
  const enrollment = useBiometricEnrollment();
  const [sheetVisible, setSheetVisible] = useState(false);

  const biometricLoginEnabled = capabilities?.auth?.biometricLogin?.enabled ?? true;
  if (!capability?.hasHardware || !biometricLoginEnabled) return null;

  const { icon, isUsable, label } = capability;

  function handleToggle(next: boolean): void {
    if (!next) {
      // Tắt: LUÔN cho tắt (xoá local + báo BE best-effort), không cần hỏi lại
      // mật khẩu — khác với BẬT, vốn phải xác nhận đúng là chủ tài khoản.
      void enrollment.disable();
      return;
    }

    if (!isUsable) {
      showToast('error', biometricUnusableGuidance(label));
      return;
    }

    enrollment.clearError();
    setSheetVisible(true);
  }

  function handleConfirm(password: string): void {
    void enrollment.enable(password).then(({ ok }) => {
      if (ok) setSheetVisible(false);
    });
  }

  function closeSheet(): void {
    setSheetVisible(false);
    enrollment.clearError();
  }

  return (
    <>
      <MeToggleRow
        description={biometricAccountContext(label, email)}
        disabled={enrollment.isEnabling || enrollment.isDisabling}
        icon={icon}
        label={biometricFeatureLabel(label)}
        tone="success"
        value={enrollment.isEnabled}
        onChange={handleToggle}
      />

      <BiometricEnrollSheet
        email={email}
        errorMessage={enrollment.errorMessage}
        icon={icon}
        isSubmitting={enrollment.isEnabling}
        label={label}
        visible={sheetVisible}
        onClearError={enrollment.clearError}
        onClose={closeSheet}
        onConfirm={handleConfirm}
      />
    </>
  );
}
