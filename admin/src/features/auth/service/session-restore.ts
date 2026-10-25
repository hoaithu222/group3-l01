/**
 * Khôi phục / đối chiếu phiên bằng cookie refresh — thuần async, không biết React.
 *
 * Access token cố ý không nằm trong localStorage (xem `auth.store.ts`), nên sau mỗi lần F5
 * hoặc mở tab mới bộ nhớ trống. Refresh token thì nằm trong cookie HttpOnly và tự đi kèm
 * request — nên một lượt `refresh` là đủ để biết người dùng còn phiên hay không.
 *
 * ⛔ Đi qua `refreshSession()` (single-flight + khoá liên tab), KHÔNG tự `fetch`/`apiClient`
 * gọi `/auth/refresh`: hai đường refresh song song là đúng thứ làm BE thấy "dùng lại refresh
 * token" và cắt phiên.
 */
import { useAuthStore } from '@/app/store';
import { authService } from '@/core/api/auth';
import { isConnectivityError } from '@/core/api/error.handler';
import { purgeAuthSession, refreshSession } from '@/core/api/session';

/**
 * Có hồ sơ trong store lúc này = trình duyệt có dấu hiệu TỪNG đăng nhập (`user` là phần duy
 * nhất được persist). Chưa có dấu hiệu thì "không hỏi được máy chủ" chỉ là "chưa đăng nhập".
 */
const hasSessionHint = (): boolean => useAuthStore.getState().user !== null;

/**
 * Có token mà thiếu hồ sơ (BE trả 200 nhưng quên `user` ở login/refresh, hoặc hồ sơ không qua được
 * `normalizeAuthUser`) thì `AuthGuard` không biết người này có được vào không — lấy hồ sơ từ
 * `/auth/me` để không kẹt ở spinner/403 oan. Gọi bởi `useSessionBootstrap`.
 */
export async function ensureProfile(): Promise<void> {
  if (useAuthStore.getState().user) return;
  try {
    const { data } = await authService.me();
    useAuthStore.getState().setAuth({ user: data });
  } catch (error) {
    if (isConnectivityError(error)) useAuthStore.getState().setStatus('unavailable');
    else purgeAuthSession(null, { broadcast: false });
  }
}

/**
 * Dựng lại phiên từ cookie. Ba kết cục — KHÔNG được gộp:
 *  - `ok`              → `refreshSession()` đã ghi token + hồ sơ, `status = 'authenticated'`.
 *  - `unauthenticated` → phiên chết: dọn sạch → `anonymous` (kèm lời nhắn nếu trước đó CÓ phiên).
 *  - `unavailable`     → mất mạng/BE 5xx: nếu có dấu hiệu từng đăng nhập thì `unavailable`
 *                        (màn "thử lại", giữ hồ sơ) thay vì đá ra đăng nhập; chưa có dấu hiệu
 *                        thì `anonymous`.
 *
 * `status` chuyển sang `restoring` NGAY (đồng bộ, trước lượt `await` đầu tiên) để guard hiện
 * spinner thay vì nháy trang đăng nhập — và để một guard thứ hai không chạy trùng.
 * Đang ở `unavailable` thì giữ nguyên màn "thử lại" trong lúc thử im lặng.
 */
export async function restoreSession(): Promise<void> {
  const store = useAuthStore.getState();
  const hadSession = hasSessionHint();
  if (store.status !== 'unavailable') store.setStatus('restoring');

  const outcome = await refreshSession();

  // `ok`: `refreshSession()` đã ghi token + hồ sơ, `status = 'authenticated'` — xong.
  if (outcome.status === 'ok') return;
  if (outcome.status === 'unavailable' && hadSession) {
    useAuthStore.getState().setStatus('unavailable');
    return;
  }
  const reason =
    hadSession && outcome.status === 'unauthenticated' ? (outcome.endReason ?? 'expired') : null;
  purgeAuthSession(reason, { broadcast: false });
}

/**
 * Đối chiếu với cookie khi tab KHÁC báo vừa đăng nhập:
 *  - tab đang ở trang đăng nhập / màn "thử lại" → khôi phục để vào thẳng ứng dụng;
 *  - tab đang đăng nhập → làm mới ngay để phát hiện cookie đã sang TÀI KHOẢN KHÁC
 *    (`refreshSession` tự ngắt phiên nếu `user.id` đổi) thay vì trộn dữ liệu hai người.
 */
export async function reconcileSession(): Promise<void> {
  const { status } = useAuthStore.getState();
  if (status === 'authenticated') {
    const outcome = await refreshSession();
    // Cookie đã chết (tab khác đăng xuất/bị thu hồi) mà tab này vẫn tưởng còn phiên → dọn ngay.
    if (outcome.status === 'unauthenticated') {
      purgeAuthSession(outcome.endReason ?? 'expired', { broadcast: false });
    }
    return;
  }
  if (status === 'anonymous' || status === 'unavailable') await restoreSession();
}
