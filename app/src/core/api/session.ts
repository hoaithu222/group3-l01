import { Platform } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';
import {
  AUTH_REFRESH_PATH,
  REFRESH_TIMEOUT_MS,
  REFRESH_TOKEN_KEY,
} from '@/core/config/auth.config';
import { appConfig } from '@/core/config/env.config';
import { getDeviceId } from '@/core/device/device-id';
import { deleteSecure, readSecure, writeSecure } from '@/core/storage/secure-storage';

import { notifySessionEnded } from './session-end';
import { readRefreshTokens } from './session.refresh-body';

/**
 * Vòng đời phiên đăng nhập ở tầng core — nơi refresh token được cất và lấy ra.
 *
 * ⚠️ ĐÂY LÀ ĐIỂM DUY NHẤT trong `src/core` chạm vào auth store và vào kho khoá.
 * Store đổi API thì chỉ phải sửa file này, không phải lùng khắp interceptor.
 */

/**
 * Kết quả một lần refresh. Ba nhánh, ⛔ KHÔNG được gộp thành boolean:
 *
 *  · `ok`              — có token mới, chạy tiếp request gốc.
 *  · `unauthenticated` — máy chủ nói thẳng phiên đã chết (400/401/403).
 *                        Dọn phiên, đưa về màn đăng nhập.
 *  · `unavailable`     — mất mạng / 5xx / quá hạn. **GIỮ NGUYÊN PHIÊN.**
 *
 * Gộp hai nhánh cuối là bug kinh điển, và trên di động nó nặng hơn web nhiều:
 * một cú chập sóng khi đi qua hầm gửi xe sẽ đăng xuất người dùng và xoá mất
 * biểu mẫu họ đang điền dở giữa công trường. Phiên thật ra vẫn còn hiệu lực.
 */
export type RefreshOutcome =
  | { status: 'ok'; accessToken: string }
  | { status: 'unauthenticated' }
  | { status: 'unavailable'; reason: string };

// ── Access token (bộ nhớ) ────────────────────────────────────────────────────

/** Access token hiện tại. `null` khi chưa đăng nhập. */
export const getAccessToken = (): string | null => useAuthStore.getState().token;

export const setAccessToken = (token: string): void => {
  useAuthStore.getState().setAuth({ token });
};

// ── Refresh token (kho khoá hệ điều hành) ───────────────────────────────────

export const getRefreshToken = (): Promise<string | null> => readSecure(REFRESH_TOKEN_KEY);

export const setRefreshToken = (token: string): Promise<boolean> =>
  writeSecure(REFRESH_TOKEN_KEY, token);

/**
 * Số lần phiên bị dọn — một lượt refresh đang bay lúc phiên bị dọn phải BỎ kết quả,
 * nếu không nó ghi lại token sau đăng xuất và "hồi sinh" phiên (`performRefresh`).
 */
let purgeEpoch = 0;

/**
 * Xoá SẠCH phiên: token trong bộ nhớ + refresh token trong kho khoá, rồi báo
 * `onSessionEnded` để vỏ ứng dụng dọn dữ liệu người dùng (`session-end.ts`).
 *
 * Gọi khi máy chủ xác nhận phiên đã chết, hoặc khi người dùng bấm đăng xuất.
 * ⛔ KHÔNG gọi khi refresh trả `unavailable` — lúc đó refresh token vẫn tốt và
 * là thứ duy nhất khôi phục được phiên khi có sóng lại.
 */
export async function purgeSession(): Promise<void> {
  const userId = useAuthStore.getState().user?.id ?? null;
  purgeEpoch += 1;
  useAuthStore.getState().clearAuth();
  await deleteSecure(REFRESH_TOKEN_KEY);
  await notifySessionEnded({ userId });
}

// ── Refresh (single-flight) ─────────────────────────────────────────────────

/**
 * N request cùng ăn 401 một lúc chỉ được phép sinh ĐÚNG MỘT lời gọi refresh.
 *
 * Backend thường XOAY VÒNG refresh token (dùng một lần rồi cấp cái mới). Bắn
 * song song thì lời gọi thứ hai mang token vừa bị vô hiệu, backend coi đó là
 * dấu hiệu token bị đánh cắp và thu hồi CẢ phiên. Người dùng bị đá ra mà không
 * hiểu vì sao.
 */
let inflight: Promise<RefreshOutcome> | null = null;

async function performRefresh(): Promise<RefreshOutcome> {
  const epochAtStart = purgeEpoch;
  const refreshToken = await getRefreshToken();
  // Không có gì để đổi lấy phiên mới ⇒ phiên chết thật.
  if (!refreshToken) return { status: 'unauthenticated' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    /**
     * `fetch` trần chứ KHÔNG `apiClient`: gọi qua `apiClient` thì chính lời gọi refresh chui vào
     * interceptor 401 → đệ quy vô tận. (`skipAuthRefresh` cũng né được, nhưng `fetch` trần còn
     * cắt luôn phụ thuộc vòng giữa `client.ts` và file này.)
     */
    // Cùng 2 header với `client.ts` (p0-13 B11) — thiếu chúng thì backend coi
    // đây là web và trả refreshToken mới qua Set-Cookie thay vì trong body,
    // nơi duy nhất `performRefresh` biết tìm nó (`readRefreshTokens`).
    const response = await fetch(`${appConfig.apiBaseUrl}${AUTH_REFRESH_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Platform': Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        'X-Device-Id': await getDeviceId(),
      },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });

    // 4xx = máy chủ đã đọc token và nói "không". Phiên chết thật.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { status: 'unauthenticated' };
    }
    // 5xx / 429 = hạ tầng trục trặc, phiên chưa chắc chết → giữ nguyên.
    if (!response.ok) return { status: 'unavailable', reason: `HTTP ${response.status}` };

    const next = readRefreshTokens(await response.json());

    // 200 mà không có token = backend sai hợp đồng. Vẫn KHÔNG giết phiên: coi
    // như hạ tầng lỗi để lần refresh sau còn cơ hội chữa.
    if (!next.accessToken) return { status: 'unavailable', reason: 'Phản hồi thiếu accessToken' };

    // ⛔ Phiên bị dọn TRONG LÚC chờ máy chủ ⇒ bỏ kết quả (ghi token là hồi sinh phiên đã
    // đăng xuất). `unavailable` chứ không `unauthenticated`: caller sẽ không `purgeSession()`
    // lần nữa — có thể đã có phiên MỚI của người khác.
    if (epochAtStart !== purgeEpoch) return { status: 'unavailable', reason: 'Phiên đã bị dọn' };

    /**
     * Backend xoay refresh token thì phải ghi cái mới NGAY.
     *
     * ⛔ Quên bước này là lỗi rất khó lần: phiên chạy tốt suốt lúc app còn mở
     * (access token trong bộ nhớ vẫn dùng được), nhưng lần mở app SAU thì
     * refresh token đã cũ và người dùng bị đăng xuất. Triệu chứng đọc ra là
     * "app hay tự đăng xuất", không ai nghĩ tới chỗ này.
     */
    if (next.refreshToken) await setRefreshToken(next.refreshToken);

    setAccessToken(next.accessToken);
    return { status: 'ok', accessToken: next.accessToken };
  } catch (error) {
    // Mạng đứt hoặc quá hạn → `unavailable`, tuyệt đối không đăng xuất.
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Lỗi mạng',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Làm mới phiên (single-flight). Xem `RefreshOutcome` để biết cách xử lý kết quả. */
export function refreshSession(): Promise<RefreshOutcome> {
  inflight ??= performRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}
