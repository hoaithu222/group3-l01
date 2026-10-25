import type { BiometricCapability } from '@/core/auth/biometric';
import { Button } from '@/shared/ui/button';

import { biometricLoginButtonA11yLabel } from '../constants/biometric.messages';

export interface BiometricLoginButtonProps {
  /** `undefined` khi chưa tải xong capability — nút chỉ render khi CÓ giá trị (nơi gọi tự kiểm `available`). */
  capability: BiometricCapability | undefined;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}

/**
 * Nút vuông 48×48 đứng CẠNH nút "Đăng nhập" (`app.md` §3) — `secondary`,
 * chỉ-icon.
 *
 * ⛔ KHÔNG tự kiểm điều kiện `available` — đó là việc của nơi gọi
 * (`LoginScreen` đọc từ `useBiometricLogin`). Tách bạch để component này
 * KHÔNG phải biết gì về store/API, chỉ vẽ đúng icon + nhãn theo `capability`
 * được truyền vào.
 */
export function BiometricLoginButton({
  capability,
  disabled = false,
  loading = false,
  onPress,
}: BiometricLoginButtonProps) {
  const label = capability?.label ?? 'sinh trắc học';

  return (
    <Button
      accessibilityLabel={biometricLoginButtonA11yLabel(label)}
      disabled={disabled}
      iconLeft={capability?.icon ?? 'lock'}
      iconOnly
      loading={loading}
      size="md"
      variant="secondary"
      onPress={onPress}
    />
  );
}
