import { readCachedCapabilities } from '@/shell/capabilities';
import { shouldLockOnColdStart, useAppLockStore } from '@/shell/app-lock';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore, waitForBiometricHydration } from '@/shell/store/slices/biometric';

/**
 * Quyết định khoá ứng dụng (P1) lúc MỞ APP LẠNH còn phiên sống — tách khỏi
 * `useSessionBootstrap.ts` để giữ file đó dưới trần 150 dòng
 * (`docs/rules/code-style.md`); đây vốn dĩ đã là MỘT bước độc lập trong chuỗi
 * khôi phục phiên (chờ hydrate xong rồi mới đọc `binding`/`capabilities`), chỉ
 * là đứng chung file cho tới khi nó làm file đó vượt trần.
 *
 * Gọi SAU khi `useAuthStore` đã có `user` (đăng nhập lại thành công) — trước
 * khi bootstrap báo `isSessionReady`, để không có khung hình nào loé nội dung
 * trang chủ trước khi lớp phủ khoá kịp bật (`app.md` §3.4).
 */
export async function applyColdStartLock(): Promise<void> {
  /**
   * (P1) Chờ store `biometric` nạp xong RỒI mới quyết định khoá — trần 3
   * giây, xem chú thích ở `waitForBiometricHydration()`.
   */
  await waitForBiometricHydration();

  const { binding } = useBiometricStore.getState();
  const currentUser = useAuthStore.getState().user;

  // Chỉ khoá khi gắn kết sinh trắc học THUỘC VỀ chính người vừa đăng nhập —
  // một binding "mồ côi" (user khác, sót lại từ trước) không có nghĩa gì để khoá lại.
  if (!binding || !currentUser || binding.userId !== currentUser.id) return;

  const capabilities = await readCachedCapabilities();
  const appLockEnabled = capabilities?.auth?.appLock?.enabled ?? true;

  if (shouldLockOnColdStart({ hasBiometricBinding: true, appLockEnabled })) {
    useAppLockStore.getState().lock();
  }
}
