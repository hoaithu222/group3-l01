/**
 * Làm mới access token cho interceptor 401: hàng đợi, phát lại request, và các
 * ca 401/403 KHÔNG được phép kích refresh.
 *
 * ── Vì sao có hàng đợi ───────────────────────────────────────────────────────
 * Khi 5 request cùng ăn 401 một lúc: request đầu chạy refresh, 4 request còn
 * lại nằm chờ ở đây rồi chạy tiếp bằng token mới. Không có hàng đợi thì cả 5
 * cùng gọi refresh, mà refresh token xoay vòng ở BE nên 4 lời gọi sau mang
 * cookie đã bị vô hiệu → phiên chết oan.
 *
 * `refreshSession()` cũng có single-flight riêng; hai lớp bổ sung cho nhau chứ
 * không thừa: lớp dưới chống GỌI TRÙNG, lớp này giữ lại REQUEST GỐC để phát lại.
 *
 * Tách khỏi `client.ts` vì đây là mối quan tâm khép kín và cũng là phần tinh tế
 * nhất của tầng HTTP — nó đáng có file riêng để đọc một mạch.
 */

import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { RequestConfig } from '@/core/api/client.types';
import { extractErrorCode } from '@/core/api/error.handler';
import { getAccessToken, purgeAuthSession, refreshSession } from '@/core/api/session';
import { AUTH_NO_REFRESH_PATHS, ENABLE_REFRESH_TOKEN } from '@/core/config/auth.config';
import { appConfig } from '@/core/config/env.config';
import { showToast } from '@/shared/utils/toast.utils';

/** Config của request đã đi qua interceptor: có thể kèm cờ `_retry` và các cờ tuỳ chọn của app. */
export type RetriableRequestConfig = InternalAxiosRequestConfig &
  RequestConfig & { _retry?: boolean };

/** Lỗi 401 mà refresh không cứu được vì máy chủ KHÔNG trả lời (phiên vẫn được giữ). */
export type SessionUnavailableError = AxiosError & { sessionUnavailable?: boolean };

let refreshing = false;
let queue: Array<{
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}> = [];

/** Có lượt refresh nào đang chạy không. */
export function isRefreshInFlight(): boolean {
  return refreshing;
}

export function beginRefresh(): void {
  refreshing = true;
}

export function endRefresh(): void {
  refreshing = false;
}

/** Xếp request hiện tại vào hàng chờ; promise trả về token mới khi có. */
export function waitForNewToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    queue.push({ resolve, reject });
  });
}

/**
 * Xả hàng đợi.
 *
 * `token` có giá trị → mọi request chờ chạy tiếp bằng token đó.
 * `token` là `null` → tất cả bị từ chối với chính `error` truyền vào.
 *
 * ⛔ Truyền LẠI đúng `AxiosError` gốc, đừng ném `new Error(...)` thô: consumer
 * sẽ mất `response`/`config`, và toast rơi về câu tiếng Anh mặc định giữa giao
 * diện tiếng Việt.
 */
export function drainQueue(error: unknown, token: string | null): void {
  for (const { resolve, reject } of queue) {
    if (token) resolve(token);
    else reject(error);
  }
  queue = [];
}

/**
 * Request có phải lời gọi xác thực CÔNG KHAI/nhạy cảm — nơi 401 nghĩa là "sai
 * thông tin" chứ không phải "access token hết hạn"? Xem `AUTH_NO_REFRESH_PATHS`.
 */
export function isCredentialRequest(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/)[0];
  return AUTH_NO_REFRESH_PATHS.some((p) => path.endsWith(p));
}

/**
 * Lỗi này có đáng để làm mới token rồi phát lại request không?
 * Chỉ 401 của request THƯỜNG, chưa thử lại, không tự khai `skipAuthRefresh`.
 */
export function shouldAttemptRefresh(
  config: RetriableRequestConfig,
  status: number | undefined,
): boolean {
  return (
    status === 401 &&
    ENABLE_REFRESH_TOKEN &&
    !config._retry &&
    !config.skipAuthRefresh &&
    !isCredentialRequest(config.url)
  );
}

/**
 * BE báo tài khoản của NGƯỜI ĐANG ĐĂNG NHẬP bị khoá / chờ xoá (403 `AUTH_011` /
 * `AUTH_012` ở một request mang token) — phiên chết ngay, refresh cũng sẽ bị từ chối.
 * `login` cũng trả đúng hai mã này cho tài khoản bị khoá, nhưng ở đó chưa có phiên
 * nào để dọn, nên loại các endpoint xác thực và request không mang token.
 */
export function isAccountEndedResponse(
  error: AxiosError,
  config: RetriableRequestConfig | undefined,
): boolean {
  if (error.response?.status !== 403 || !config?.headers?.Authorization) return false;
  if (isCredentialRequest(config.url)) return false;
  const code = extractErrorCode(error);
  return code === 'AUTH_011' || code === 'AUTH_012';
}

/** Chờ tối thiểu giữa hai toast "không kết nối được" — 20 request lỗi cùng lúc chỉ được một toast. */
const UNAVAILABLE_TOAST_COOLDOWN_MS = 15_000;
let lastUnavailableToastAt = 0;

function notifyRefreshUnavailable(): void {
  const now = Date.now();
  if (now - lastUnavailableToastAt < UNAVAILABLE_TOAST_COOLDOWN_MS) return;
  lastUnavailableToastAt = now;
  showToast('warning', 'Không kết nối được máy chủ. Phiên của bạn vẫn được giữ — thử lại sau ít phút.');
}

/**
 * Làm mới access token. Trả token mới, hoặc `null` nếu không refresh được.
 *
 * ⛔ CHỈ `unauthenticated` (máy chủ nói thẳng phiên chết) mới dọn phiên + đá về
 * trang đăng nhập. `unavailable` (mất mạng / 5xx) GIỮ NGUYÊN phiên: request gốc
 * fail như một lỗi mạng bình thường, mạng về là lần refresh sau chạy tiếp.
 * Gộp hai trường hợp làm một là bug kinh điển — một cú chập mạng giết phiên và
 * người dùng mất sạch việc đang làm dở.
 *
 * Đá về đăng nhập KHÔNG làm ở đây: `purgeAuthSession` đổi `status` trong store,
 * `AuthGuard` thấy và tự điều hướng kèm `from`. Điều hướng cứng tải lại cả trang.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();

  if (outcome.status === 'ok') {
    if (appConfig.enableApiLogging) console.log('✅ Đã làm mới access token');
    return outcome.token;
  }

  if (outcome.status === 'unavailable') {
    if (appConfig.enableApiLogging) {
      console.warn(`⚠️ Refresh thất bại tạm thời (${outcome.reason}) — GIỮ phiên`);
    }
    return null;
  }

  if (appConfig.enableApiLogging) console.error('❌ Phiên không còn hiệu lực');
  purgeAuthSession(outcome.endReason ?? 'expired');
  return null;
}

/**
 * Xử lý một request ăn 401: làm mới token (hoặc chờ lượt đang chạy) rồi PHÁT LẠI.
 *
 * Trả response của lượt phát lại; ném lỗi khi refresh không cứu được. `replay` do
 * `client.ts` truyền vào (`(c) => apiClient(c)`) — file này không tự import
 * `apiClient` để khỏi vòng phụ thuộc.
 *
 * ⛔ Vùng tới hạn kết thúc ĐÚNG lúc xả hàng đợi — lượt phát lại request gốc nằm
 * NGOÀI nó.
 *
 * Bản trước viết `return await apiClient(originalRequest)` bên trong `try`, nên
 * `finally { endRefresh() }` phải đợi cả lượt phát lại. Suốt khoảng đó cờ vẫn bật
 * nhưng hàng đợi đã rỗng: request nào ăn 401 đúng lúc này sẽ tự xếp vào hàng đợi
 * mà không còn ai xả — promise treo vĩnh viễn, và `timeout` của axios không cứu
 * được vì nó chỉ áp cho lời gọi HTTP chứ không áp cho chuỗi promise của interceptor.
 *
 * Nếu lượt phát lại lại ăn 401 nữa thì request đó KHÔNG mở lượt refresh mới:
 * `_retry` chặn vòng lặp vô hạn (mỗi vòng tốn một lần xoay refresh token phía BE).
 *
 * Xem `tests/core/refresh-queue-window.test.ts`.
 */
export async function refreshAndReplay(
  error: AxiosError,
  config: RetriableRequestConfig,
  replay: (config: RetriableRequestConfig) => Promise<AxiosResponse>,
): Promise<AxiosResponse> {
  const withToken = (token: string): RetriableRequestConfig => {
    config._retry = true;
    if (config.headers) config.headers.Authorization = `Bearer ${token}`;
    return config;
  };

  if (isRefreshInFlight()) {
    // Xếp hàng chờ token mới rồi chạy lại request gốc.
    return replay(withToken(await waitForNewToken()));
  }

  config._retry = true;
  beginRefresh();

  let newToken: string | null;
  try {
    newToken = await refreshAccessToken();
    // Trả LẠI chính AxiosError 401 cho hàng đợi khi refresh hỏng. Ném
    // `new Error(...)` thô vào đây là consumer mất `response`/`config`, và
    // toast rơi về câu tiếng Anh mặc định giữa giao diện tiếng Việt.
    drainQueue(newToken ? null : error, newToken);
  } catch (refreshError) {
    drainQueue(refreshError, null);
    endRefresh();
    throw refreshError;
  }
  endRefresh();

  if (!newToken) {
    // Còn token = phiên được GIỮ (máy chủ không trả lời) chứ không phải đã bị dọn.
    if (getAccessToken() !== null) {
      (error as SessionUnavailableError).sessionUnavailable = true;
      if (!config.skipErrorToast && appConfig.enableErrorToast) notifyRefreshUnavailable();
    }
    throw error;
  }

  return replay(withToken(newToken));
}
