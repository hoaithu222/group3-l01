import { useEffect, useRef } from 'react';
import { BackHandler, View } from 'react-native';

import { useAppLockStore } from '@/shell/app-lock';
import { useLogout } from '@/shell/session/useLogout';
import { useBiometricStore } from '@/shell/store/slices/biometric';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricCapability } from '@/shared/hooks/useBiometricCapability';
import { Alert } from '@/shared/ui/alert';
import { LinkButton } from '@/shared/ui/button';

import { AuthScreenLayout } from '../AuthScreenLayout';
import { BiometricLoginButton } from '../BiometricLoginButton';
import { APP_LOCK_NOT_YOU_LOGOUT } from '../../constants/biometric.messages';
import { useBiometricUnlock } from '../../hooks/useBiometricUnlock';
import { AppUnlockForm } from './AppUnlockForm';

/** Chờ hoạt ảnh app quay lại `active` ổn định trước khi tự bật hộp quét. */
const AUTO_UNLOCK_DELAY_MS = 400;

/**
 * Lớp phủ khoá ứng dụng (P1) — TUYỆT ĐỐI, KHÔNG phải route (`app.md` §1/§2).
 *
 * Render ở `app/_layout.tsx`, SAU `<Stack>` (không lồng bên trong) — khi
 * `locked === false` component trả `null` và không chiếm chỗ gì cả.
 *
 * ⛔ KHÔNG dùng `<Modal>` của React Native cho lớp phủ này (bài học từ
 * `vci-sun-mobile`, `app.md` §7): iOS không present được MỘT modal thứ hai nếu
 * lúc khoá đang có sheet/dialog nào khác đang mở — một `View` absolute-fill
 * bình thường không vướng giới hạn đó.
 */
export function AppLockOverlay() {
  const locked = useAppLockStore((state) => state.locked);
  const email = useAuthStore((state) => state.user?.email ?? '');
  const binding = useBiometricStore((state) => state.binding);
  const { data: capability } = useBiometricCapability();
  const { errorMessage, isPending, unlock } = useBiometricUnlock();
  const { logout } = useLogout();

  const canUseBiometric = Boolean(binding) && Boolean(capability?.isUsable);

  /** Đảm bảo tự bật hộp quét ĐÚNG MỘT LẦN mỗi LƯỢT khoá (không phải mỗi lượt render). */
  const triedThisLockRef = useRef(false);

  useEffect(() => {
    if (!locked) {
      triedThisLockRef.current = false;
      return undefined;
    }
    if (triedThisLockRef.current || !canUseBiometric) return undefined;
    triedThisLockRef.current = true;

    const timer = setTimeout(() => void unlock(), AUTO_UNLOCK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canUseBiometric, locked, unlock]);

  /**
   * Chặn nút Back cứng của Android trong lúc khoá — không có gì "phía sau" lớp
   * phủ này để lùi về, và nếu để lọt thì Android lùi thẳng ra khỏi app, tưởng
   * như thoát app trong khi phiên vẫn còn sống.
   */
  useEffect(() => {
    if (!locked) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [locked]);

  if (!locked) return null;

  return (
    <View
      accessibilityViewIsModal
      className="absolute inset-0 z-50"
      /**
       * VoiceOver/TalkBack chỉ đọc BÊN TRONG lớp phủ này khi nó đang hiện —
       * `accessibilityViewIsModal` lo phần iOS. Phần Android (ẩn cây `<Stack>`
       * bên dưới khỏi cây trợ năng) nằm ở `app/_layout.tsx`, nơi duy nhất có
       * quyền bọc `<Stack>` trong một `<View>` mang `importantForAccessibility`.
       */
    >
      <AuthScreenLayout subtitle={email} title="Mở khoá để tiếp tục">
        <View className="gap-md">
          {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

          {canUseBiometric ? (
            <View className="flex-row items-center gap-sm">
              <BiometricLoginButton
                capability={capability}
                loading={isPending}
                onPress={() => void unlock()}
              />
            </View>
          ) : null}

          <AppUnlockForm defaultEmail={email} />

          <View className="items-center">
            {/* `LinkButton` (vùng chạm 44dp nhờ `hitSlop`) thay cho `Pressable` + `Text` chỉ cao 20dp. */}
            <LinkButton label={APP_LOCK_NOT_YOU_LOGOUT} onPress={() => logout()} />
          </View>
        </View>
      </AuthScreenLayout>
    </View>
  );
}
