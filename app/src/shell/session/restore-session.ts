import { authService } from '@/core/api/auth';
import { getRefreshToken, purgeSession, refreshSession } from '@/core/api/session';
import { redirectToPendingInvite } from '@/features/members/store/pending-invite';
import { useAuthStore } from '@/shell/store/slices/auth';

import { applyColdStartLock } from './apply-cold-start-lock';
import { rememberInitialDeepLink } from './use-post-login-intent-capture';

/**
 * Trần chờ hồ sơ `GET /auth/me` LÚC KHỞI ĐỘNG. Mặc định `apiTimeout` là 30 giây: cộng với trần
 * refresh 15 giây là màn hình chờ có thể kẹt gần MỘT PHÚT trên mạng chập chờn — trong khi hồ sơ đã
 * persist vẫn dùng tạm được và token đã hợp lệ.
 */
const ME_TIMEOUT_MS = 8000;

/**
 * Kết quả khôi phục phiên lúc mở app:
 *  · `restored`    — có token mới, đã vào phiên.
 *  · `anonymous`   — chắc chắn không có phiên (chưa từng đăng nhập, hoặc máy chủ nói phiên đã chết).
 *  · `unavailable` — mất sóng/máy chủ lỗi: chưa biết, refresh token vẫn còn trong kho khoá.
 */
export type RestoreResult = 'anonymous' | 'restored' | 'unavailable';

/**
 * Khôi phục phiên lúc khởi động — tách khỏi `useSessionBootstrap.ts` (giữ file đó dưới trần 150).
 *
 * ── Ba trạng thái phải phân biệt, ⛔ không được gộp ─────────────────────────────
 * `restoring` (đang hỏi — guard PHẢI chờ), `authenticated`, `anonymous`. Gộp `restoring` vào
 * `anonymous` là màn đăng nhập chớp lên mỗi lần mở app, đọc ra là "app hay tự đăng xuất".
 */
export async function restoreSession(): Promise<RestoreResult> {
  const hadSession = (await getRefreshToken()) !== null || useAuthStore.getState().user !== null;

  useAuthStore.getState().setStatus('restoring');
  const outcome = await refreshSession();

  if (outcome.status === 'unauthenticated') {
    /**
     * Phiên CHẾT thật (máy chủ nói 4xx, hoặc không còn refresh token): dọn cho sạch — refresh
     * token chết trong kho khoá, hồ sơ đã persist trong `AsyncStorage`, và dữ liệu người dùng
     * còn sót (`purgeSession` → `wipeUserData`). Trước đây nhánh này chỉ đặt `anonymous`: hồ sơ
     * và store của phiên chết nằm nguyên cho người đăng nhập kế tiếp.
     * Chưa từng có phiên nào (cài mới/đã đăng xuất) thì khỏi dọn — mỗi lần mở app không đáng.
     */
    if (hadSession) await purgeSession();
    else useAuthStore.getState().setStatus('anonymous');
    await rememberInitialDeepLink();
    return 'anonymous';
  }

  if (outcome.status === 'unavailable') {
    // ⛔ Mất sóng: KHÔNG dọn gì — refresh token còn nguyên trong kho khoá nên lần mở app sau (có
    // sóng) người dùng vào thẳng. Ở đây chỉ đưa về `anonymous` để guard thôi chặn chờ.
    useAuthStore.getState().setStatus('anonymous');
    await rememberInitialDeepLink();
    return 'unavailable';
  }

  /**
   * Có token rồi thì lấy hồ sơ. Hồ sơ đã persist có thể CŨ (đổi tên, admin đổi quyền) nên phải
   * làm mới — nhưng hồ sơ lấy hỏng KHÔNG làm hỏng phiên: token vẫn tốt, bản đã lưu dùng tạm được.
   * Đá người dùng ra vì một lượt `/me` chập chờn là quá tay.
   */
  try {
    const user = await authService.me({ timeoutMs: ME_TIMEOUT_MS });
    useAuthStore.getState().setAuth({ user });
  } catch {
    useAuthStore.getState().setStatus('authenticated');
  }

  // (P1) Quyết định khoá ứng dụng lúc mở lạnh — xem `apply-cold-start-lock.ts`.
  await applyColdStartLock();

  // p1-02 app.md §1: sau khi phiên `ok`, `pendingInvite` còn hạn → `router.replace('/invite/…')`.
  // Ca MỞ LẠNH: app bị đóng sau khi người dùng bấm "Đăng nhập"/"Tạo tài khoản" trên màn lời mời —
  // phiên khôi phục lặng lẽ, không đi qua `completeSignIn`. (Link ngắn `/live`, `/w`… thì khỏi lo:
  // phiên còn sống nên Expo Router tự mở đúng link khởi động.)
  await redirectToPendingInvite();
  return 'restored';
}
