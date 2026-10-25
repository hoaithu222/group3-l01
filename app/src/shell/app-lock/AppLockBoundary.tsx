import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useCapabilities } from '@/shell/capabilities';
import { useBiometricStore } from '@/shell/store/slices/biometric';
import { useAuthStore } from '@/shell/store/slices/auth';

import { checkLock } from './app-lock.policy';
import { useAppLockStore } from './app-lock.store';
import { shouldDeferLock } from './lock-deferrers';
import { useAppSwitcherPrivacy } from './use-app-switcher-privacy';

/** Mặc định khi `/capabilities` chưa trả khối `auth` (BE cũ, hoặc chưa tải xong). */
const DEFAULT_LOCK_AFTER_BACKGROUND_SECONDS = 300;

/**
 * Áp luật khoá ứng dụng theo `AppState` — HEADLESS, không vẽ gì.
 *
 * Render ở `app/_layout.tsx`, NGANG HÀNG với `<Stack>` (không lồng vào trong),
 * để nó sống suốt vòng đời app bất kể đang ở route nào — `app.md` §1: "khoá là
 * LỚP PHỦ, không phải route".
 *
 * ── Vì sao chỉ tính `background`, ⛔ không `inactive` ─────────────────────────
 * iOS chuyển app sang `inactive` MỖI KHI hộp thoại Face ID hiện lên (đó là hành
 * vi hệ điều hành, không phải người dùng rời app). Tính cả `inactive` thì mỗi
 * lượt tự quét sinh trắc học ở màn Đăng nhập cũng kích hoạt logic khoá ứng
 * dụng — hai luồng giẫm chân nhau ngay trong lượt đăng nhập đầu tiên.
 */
export function AppLockBoundary(): null {
  const authStatus = useAuthStore((state) => state.status);
  const binding = useBiometricStore((state) => state.binding);
  const { data: capabilities } = useCapabilities();

  const appLockEnabled = capabilities?.auth?.appLock?.enabled ?? true;
  const lockAfterBackgroundSeconds =
    capabilities?.auth?.appLock?.lockAfterBackgroundSeconds ??
    DEFAULT_LOCK_AFTER_BACKGROUND_SECONDS;
  const isAuthenticated = authStatus === 'authenticated';

  // Ảnh chụp app switcher của hệ điều hành không được lộ nội dung khi khoá ứng dụng đang áp dụng.
  useAppSwitcherPrivacy(isAuthenticated && Boolean(binding) && appLockEnabled);

  /** Mốc thời gian app rời `active` lần gần nhất — `null` = đang active hoặc đã xử lý xong. */
  const backgroundedAtRef = useRef<number | null>(null);
  /** Vòng lặp hỏi lại `shouldDeferLock()` trong lúc đang HOÃN. */
  const deferPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearDeferPoll = useCallback(() => {
    if (deferPollRef.current) {
      clearInterval(deferPollRef.current);
      deferPollRef.current = null;
    }
  }, []);

  const applyLockAndReset = useCallback(() => {
    useAppLockStore.getState().lock();
    backgroundedAtRef.current = null;
    clearDeferPoll();
  }, [clearDeferPoll]);

  const evaluate = useCallback(() => {
    const decision = checkLock({
      hasBiometricBinding: Boolean(binding),
      isAuthenticated,
      appLockEnabled,
      backgroundedAt: backgroundedAtRef.current,
      now: Date.now(),
      lockAfterBackgroundSeconds,
    });

    if (decision === 'lock') {
      applyLockAndReset();
      return;
    }

    if (decision === 'defer') {
      // Đã có một vòng hỏi lại đang chạy thì khỏi tạo thêm.
      if (deferPollRef.current) return;
      deferPollRef.current = setInterval(() => {
        // Đăng xuất trong lúc đang hoãn (vd cuộc gọi kết thúc bằng đăng xuất) ⇒ thôi, đừng khoá
        // màn Đăng nhập.
        if (useAuthStore.getState().status !== 'authenticated') clearDeferPoll();
        else if (!shouldDeferLock()) applyLockAndReset();
      }, 2000);
      return;
    }

    // 'skip' — dù là "chưa đủ ngưỡng" hay "không có gì để khoá", đều coi như
    // xong việc với lượt background này.
    backgroundedAtRef.current = null;
  }, [
    appLockEnabled,
    applyLockAndReset,
    binding,
    clearDeferPoll,
    isAuthenticated,
    lockAfterBackgroundSeconds,
  ]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current !== null) {
        evaluate();
      }
      // 'inactive' bị bỏ qua CÓ CHỦ ĐÍCH — xem chú thích đầu file.
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      subscription.remove();
      clearDeferPoll();
    };
  }, [clearDeferPoll, evaluate]);

  /**
   * Phiên CHẾT trong lúc đang khoá (refresh thất bại lúc app ở nền) ⇒ gỡ khoá
   * ngay — lớp phủ khoá là để bảo vệ một phiên VẪN SỐNG, giữ nó hiện lên trên
   * một phiên đã chết chỉ khiến người dùng bấm sinh trắc học vào khoảng không,
   * không hiểu vì sao không có phản hồi. Guard của `(app)/_layout.tsx` tự đưa
   * họ về màn Đăng nhập ngay khi cờ `locked` tắt.
   */
  useEffect(() => {
    if (authStatus === 'anonymous') useAppLockStore.getState().unlock();
  }, [authStatus]);

  return null;
}
