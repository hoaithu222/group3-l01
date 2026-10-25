/**
 * Vòng đời phiên đăng nhập ở tầng core — refresh + dọn phiên.
 *
 * ⚠️ ĐÂY LÀ ĐIỂM DUY NHẤT trong `src/core` chạm vào auth store. Store đổi API
 * thì chỉ phải sửa file này, không phải lùng khắp interceptor.
 */
import { normalizeAuthUser, useAuthStore } from '@/app/store';
import type { SessionEndReason } from '@/app/store';
import {
  AUTH_REFRESH_PATH,
  REFRESH_LOCK_NAME,
  REFRESH_TIMEOUT_MS,
  TOKEN_EXPIRY_LEEWAY_MS,
} from '@/core/config/auth.config';
import { appConfig } from '@/core/config/env.config';
import { queryClient } from '@/core/config/query-client';
import { announceSessionEnded } from './session.sync';

/**
 * Kết quả một lần refresh. Ba nhánh, KHÔNG được gộp lại thành boolean:
 *
 *  - `ok`               — có token mới, chạy tiếp request gốc.
 *  - `unauthenticated`  — máy chủ nói thẳng phiên đã chết (400/401/403; lý do đọc theo mã lỗi).
 *                         Dọn phiên, đá về trang đăng nhập. `endReason` cho biết
 *                         vì sao (khoá tài khoản, bị thu hồi, hết hạn thường).
 *  - `unavailable`      — mất mạng / 5xx / quá hạn. **GIỮ NGUYÊN PHIÊN.**
 *                         Đá người dùng ra ngoài vì một cú chập mạng là lỗi
 *                         kinh điển: họ mất hết việc đang làm dở trong khi
 *                         phiên thật ra vẫn còn hiệu lực.
 */
export type RefreshOutcome =
  | { status: 'ok'; token: string }
  | { status: 'unauthenticated'; endReason?: SessionEndReason }
  | { status: 'unavailable'; reason: string };

interface RefreshResponseBody {
  accessToken?: string;
  access_token?: string;
  user?: unknown;
}

const unwrapRefreshBody = (raw: unknown): RefreshResponseBody => {
  if (raw !== null && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as { data?: unknown }).data;
    if (inner !== null && typeof inner === 'object') return inner as RefreshResponseBody;
  }
  return (raw ?? {}) as RefreshResponseBody;
};

/** Access token hiện tại (trong bộ nhớ). `null` khi chưa đăng nhập. */
export const getAccessToken = (): string | null => useAuthStore.getState().token;

/**
 * Xoá sạch phiên phía client. Gọi khi máy chủ xác nhận phiên đã chết, khi người
 * dùng bấm đăng xuất, hoặc khi tab khác báo phiên đã kết thúc. ⛔ KHÔNG gọi khi
 * refresh trả `unavailable`.
 *
 * Không điều hướng: `AuthGuard` đọc `status` của store và tự đưa về `/login` kèm
 * `from` — điều hướng cứng (`window.location.assign`) tải lại cả trang, mất `from`
 * và mất luôn lời nhắn "phiên đã hết hạn".
 *
 * ⛔ Dọn cả React Query cache: `clearAuth()` chỉ đụng Zustand. Tải lại trang từng
 * là thứ vô tình dọn cache hộ; không còn tải lại thì người thứ hai đăng nhập trên
 * CÙNG tab sẽ thấy ngay dữ liệu của người trước. `clear()` chứ không phải
 * `invalidateQueries()` — invalidate vẫn giữ dữ liệu cũ để hiển thị trong lúc tải lại.
 *
 * @param reason  vì sao phiên kết thúc; `null` = người dùng chủ động thoát.
 * @param options.broadcast  báo cho các tab khác (mặc định có). Tắt khi chính tin
 *   nhắn từ tab khác gọi vào đây, kẻo hai tab dội tin qua lại mãi.
 */
export const purgeAuthSession = (
  reason: SessionEndReason | null = null,
  { broadcast = true }: { broadcast?: boolean } = {},
): void => {
  const wasAnonymous = useAuthStore.getState().status === 'anonymous';
  // Đã dọn rồi (đăng xuất, hoặc một lượt dọn trước) mà giờ mới có request bay trễ báo "phiên chết":
  // KHÔNG được viết đè lý do — người vừa bấm đăng xuất sẽ thấy "phiên đã hết hạn" ở trang đăng nhập.
  // Chỉ lượt dọn KHÔNG có lý do (người dùng chủ động thoát) mới được thắng.
  if (wasAnonymous && reason !== null) return;

  useAuthStore.getState().clearAuth(reason);
  queryClient.clear();
  // Đã ở `anonymous` nghĩa là ai đó (tab khác, hoặc lượt dọn trước) đã báo rồi.
  if (broadcast && !wasAnonymous) announceSessionEnded(reason);
};

/**
 * Token còn hạn (đã trừ biên an toàn) hay chưa?
 * Token không giải mã được ⇒ coi là CÒN hạn: quyết định sống/chết của phiên là
 * việc của máy chủ, FE đoán sai mà tự đăng xuất thì hại hơn là để request đi.
 */
export const isAccessTokenFresh = (token: string | null): boolean => {
  if (!token) return false;
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
      string,
      unknown
    >;
    if (typeof decoded.exp !== 'number') return true;
    return decoded.exp * 1000 - Date.now() > TOKEN_EXPIRY_LEEWAY_MS;
  } catch {
    return true;
  }
};

/** Đọc mã lỗi `{ error: { code } }` của BE từ response lỗi — `null` nếu không phải JSON đó. */
const readErrorCode = async (res: Response): Promise<string | null> => {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } } | null;
    return typeof body?.error?.code === 'string' ? body.error.code : null;
  } catch {
    return null;
  }
};

/**
 * Vì sao máy chủ từ chối refresh — đọc theo MÃ LỖI, không theo status: `AUTH_011`/`AUTH_012` =
 * tài khoản khoá/chờ xoá, `AUTH_010` = refresh token bị dùng lại (mọi phiên đã bị thu hồi).
 *
 * ⛔ Không suy "403 ⇒ khoá tài khoản". `POST /auth/refresh` còn trả 403 khi `Origin` của yêu
 * cầu không nằm trong `ALLOWED_ORIGINS` (`requireTrustedOrigin`, chống CSRF): đó là cấu hình
 * triển khai sai, không phải tài khoản bị khoá — hiện "tài khoản bị khoá" sẽ đẩy người dùng đi
 * hỏi quản trị viên nhầm chỗ.
 */
const endReasonOf = async (res: Response): Promise<SessionEndReason> => {
  const code = await readErrorCode(res);
  if (code === 'AUTH_011' || code === 'AUTH_012') return 'locked';
  return code === 'AUTH_010' ? 'revoked' : 'expired';
};

/** Một lượt gọi refresh thật (`fetch` trần). Không bao giờ ném — mọi kết cục là một `RefreshOutcome`. */
const fetchRefresh = async (): Promise<RefreshOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    // Dùng `fetch` trần chứ KHÔNG dùng `apiClient`: gọi qua apiClient thì chính
    // lời gọi refresh cũng chui vào interceptor 401 → đệ quy vô tận.
    const res = await fetch(`${appConfig.apiBaseUrl}${AUTH_REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Cookie HttpOnly chứa refresh token đi kèm được là nhờ dòng này.
      credentials: 'include',
      signal: controller.signal,
    });

    // 4xx = máy chủ đã đọc cookie và nói "không". Phiên chết thật.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { status: 'unauthenticated', endReason: await endReasonOf(res) };
    }
    // 5xx / 429 = hạ tầng trục trặc, phiên chưa chắc đã chết → giữ nguyên.
    if (!res.ok) {
      return { status: 'unavailable', reason: `HTTP ${res.status}` };
    }

    // Bóc lớp bọc `{ data: {...} }` nếu có — cùng quy ước với `unwrapData`
    // ở `@/core/api/unwrap`, nhưng lặp lại tại đây vì lời gọi này cố ý KHÔNG
    // đi qua tầng service (xem chú thích về đệ quy phía trên).
    const body = unwrapRefreshBody(await res.json());
    const token = body.accessToken ?? body.access_token;
    // 200 mà không có token = BE sai hợp đồng. Vẫn KHÔNG giết phiên: coi như
    // hạ tầng lỗi để lần refresh sau còn cơ hội chữa.
    if (!token) return { status: 'unavailable', reason: 'Phản hồi thiếu accessToken' };

    const state = useAuthStore.getState();
    // Người dùng đã thoát (hoặc phiên đã bị dọn) TRONG LÚC lượt này còn bay: ghi
    // token vào bây giờ là hồi sinh một phiên đã đăng xuất.
    if (state.status === 'anonymous') return { status: 'unauthenticated' };

    const incoming = normalizeAuthUser(body.user);
    // Cookie giờ thuộc về NGƯỜI KHÁC (đăng nhập tài khoản khác ở tab khác): tab này
    // đang giữ dữ liệu của người trước, tiếp tục là trộn dữ liệu hai tài khoản.
    if (state.status === 'authenticated' && state.user && incoming && state.user.id !== incoming.id) {
      purgeAuthSession('revoked', { broadcast: false });
      return { status: 'unauthenticated', endReason: 'revoked' };
    }

    // Ghi cả hồ sơ: quyền/vai trò có thể đã đổi từ lần trước, và `permission:revoked`
    // chỉ làm mới dữ liệu chứ không đụng tới `user` trong store.
    state.setAuth({ token, user: incoming ?? undefined });
    return { status: 'ok', token };
  } catch (err) {
    // Mạng đứt hoặc quá hạn → `unavailable`, tuyệt đối không đăng xuất.
    return { status: 'unavailable', reason: err instanceof Error ? err.message : 'Lỗi mạng' };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Chờ khoá tối đa ngần này (ms). Tab đang giữ khoá luôn nhả trong `REFRESH_TIMEOUT_MS` (fetch tự
 * huỷ), nhưng một tab bị trình duyệt ĐÓNG BĂNG giữa lúc giữ khoá thì không — không được để nó
 * treo mọi tab còn lại.
 */
const LOCK_WAIT_MS = 15_000;

/**
 * Xếp hàng lượt refresh giữa MỌI tab (Web Locks) — xem `REFRESH_LOCK_NAME`.
 * Trình duyệt/môi trường không có Web Locks (jsdom, Safari < 15.4) thì chạy thẳng.
 * `fetchRefresh` không bao giờ ném nên chạy-lại-khi-lỗi-khoá không bị chạy hai lần.
 */
const withRefreshLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return task();
  try {
    const options: LockOptions =
      typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(LOCK_WAIT_MS) } : {};
    return await locks.request(REFRESH_LOCK_NAME, options, task);
  } catch {
    // Khoá không cấp được (chờ quá lâu, SecurityError ở origin đặc biệt…) — thà mất khoá liên tab
    // còn hơn mất phiên hoặc treo mọi request đang xếp hàng.
    return task();
  }
};

/**
 * Single-flight: N request cùng ăn 401 một lúc chỉ được phép sinh ĐÚNG MỘT lời
 * gọi refresh. Refresh token xoay vòng ở BE — bắn song song thì lời gọi thứ hai
 * mang cookie vừa bị vô hiệu, và phiên chết oan.
 */
let inflight: Promise<RefreshOutcome> | null = null;

/** Refresh phiên (single-flight). Xem `RefreshOutcome` để biết cách xử lý kết quả. */
export const refreshSession = (): Promise<RefreshOutcome> => {
  inflight ??= withRefreshLock(fetchRefresh).finally(() => {
    inflight = null;
  });
  return inflight;
};

/**
 * Bảo đảm access token còn hạn TRƯỚC khi gửi một request không được phép ăn 401
 * "oan" — điển hình là đổi mật khẩu: endpoint đó nằm trong `AUTH_NO_REFRESH_PATHS`
 * (401 ở đó nghĩa "sai mật khẩu hiện tại"), nên interceptor không tự cứu được token
 * đã hết hạn. Kết quả refresh bị bỏ qua có chủ ý: nếu phiên chết thì chính request
 * sau đó sẽ báo lỗi, không cần xử lý hai lần.
 */
export const ensureFreshAccessToken = async (): Promise<void> => {
  if (isAccessTokenFresh(getAccessToken())) return;
  await refreshSession();
};
