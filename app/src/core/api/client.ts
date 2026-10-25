import axios, { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { getDeviceId } from '@/core/device/device-id';
import { logger } from '@/shared/utils/logger';
import { showToast } from '@/shared/utils/toast.utils';

import { isAccountBlocked, isCredentialRejection } from './client.credentials';
import { getApiErrorMessage, getErrorMessage, redactSecrets } from './client.helpers';
import {
  beginRefresh,
  drainQueue,
  endRefresh,
  isRefreshInFlight,
  refreshAccessToken,
  waitForNewToken,
} from './client.refresh';
import { getAccessToken, purgeSession } from './session';
import type { ApiErrorBody, ToastMarkedError } from './client.types';

/**
 * Thực thể axios dùng chung — gắn token, xử lý lỗi tập trung, làm mới token khi 401.
 *
 * Bốn việc đáng chú ý ở file này:
 *  1. `paramsSerializer` lặp key cho mảng (hợp .NET) thay vì `key[]=`.
 *  2. Phát hiện lỗi nghiệp vụ mà backend vẫn trả HTTP 2xx.
 *  3. Xử lý 401: làm mới token có xếp hàng (`client.refresh.ts`); không cứu được thì dọn phiên.
 *  4. Toast lỗi ĐÚNG MỘT LẦN, kể cả khi nhiều tầng cùng thấy lỗi đó.
 */

/**
 * Mảng thành `key=v1&key=v2` (lặp key) cho .NET hiểu.
 * Mặc định axios sinh `ids[]=1&ids[]=2` — model binder của .NET không nhận, và
 * nó không báo lỗi mà trả về danh sách RỖNG. Rất tốn thời gian để lần ra.
 */
function paramsSerializer(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.append(key, String(value));
  }
  return search.toString();
}

export const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: appConfig.apiTimeout,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  paramsSerializer,
  /**
   * ⛔ KHÔNG có `withCredentials` như bản web.
   *
   * Bên web, refresh token đi trong cookie `HttpOnly` và cờ đó là thứ khiến
   * trình duyệt tự đính kèm. Trên di động không có cơ chế cookie nào tương
   * đương: refresh token nằm trong kho khoá của hệ điều hành và được gửi tường
   * minh trong body — xem `session.ts`.
   */
});

/** Mã mời nằm NGAY TRONG URL (`/invites/:token`, `/invitations/by-token/:token` — p3-04) — che kể cả khi `enableApiLogging` bật (p1-02 app.md §3). */
function sanitizeLogUrl(url: string): string {
  return url.replace(/\/(invites|invitations\/by-token)\/[^/?]+/i, '/$1/***');
}

/** In một dòng log mạng. Tự tắt khi `enableApiLogging` tắt. */
function logLine(icon: string, method: string, url: string, extra?: unknown): void {
  if (!appConfig.enableApiLogging) return;
  url = sanitizeLogUrl(url);
  logger.info(`${icon} ${method} ${url}`, ...(extra === undefined ? [] : [extra]));
}

// ── Request ─────────────────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);

    /**
     * `X-Client-Platform` + `X-Device-Id` (p0-13 B11).
     *
     * Thiếu header này thì backend coi MỌI request là web và không bao giờ trả
     * `refreshToken` trong body (chỉ set cookie httpOnly — vô dụng trên di
     * động) — phiên không lưu lại được sau khi đóng app. Gắn ở tầng interceptor
     * (không phải riêng lẻ từng lời gọi login/register/biometric) để không ai
     * quên khi thêm endpoint mới sau này; `getDeviceId()` cache trong bộ nhớ
     * sau lần đọc đầu nên không tốn thêm round-trip AsyncStorage ở các request
     * tiếp theo.
     */
    config.headers.set('X-Client-Platform', Platform.OS === 'ios' ? 'IOS' : 'ANDROID');
    config.headers.set('X-Device-Id', await getDeviceId());

    /**
     * ⛔ Tải tệp: PHẢI xoá `Content-Type` để axios tự đặt kèm `boundary`.
     *
     * Trên React Native, `FormData` nhận `{ uri, name, type }` chứ không phải
     * `File`. Nếu giữ `application/json` từ mặc định thì máy chủ nhận một body
     * multipart nhưng được khai là JSON, và trả 400 hoặc — tệ hơn — nhận một tệp
     * rỗng mà vẫn báo thành công.
     */
    if (config.data instanceof FormData) config.headers.delete('Content-Type');

    config.__startedAt = Date.now();
    if (appConfig.enableApiLogging) {
      const method = config.method?.toUpperCase() ?? 'GET';
      const payload =
        appConfig.logApiPayload && !/\/invit(es|ations)/.test(config.url ?? '')
          ? redactSecrets(
              config.data instanceof FormData ? '[FormData]' : (config.data ?? config.params),
            )
          : undefined;
      logLine('🌐', method, config.url ?? '', payload);
    }
    return config;
  },
  (error: AxiosError) => {
    if (appConfig.enableApiLogging) logger.error('❌ Lỗi request:', error.message);
    return Promise.reject(error);
  },
);

// ── Response ────────────────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const method = response.config.method?.toUpperCase() ?? 'GET';
    const elapsed = Date.now() - (response.config.__startedAt ?? Date.now());

    /**
     * Lỗi nghiệp vụ trả KÈM HTTP 2xx:
     *   `{ status: false, errorCode: "..." }` · `{ success: false, error: {...} }`
     *
     * Axios coi 2xx là thành công → phải tự phát hiện ở đây rồi reject. Không
     * làm thì `onSuccess` của mutation chạy cho một LỖI: màn hình báo "Đã lưu"
     * và đóng lại, trong khi backend không lưu gì cả.
     */
    const body = response.data as { status?: boolean; success?: boolean } | undefined;
    const isBusinessError =
      !response.config.skipBusinessErrorHandling &&
      !!body &&
      typeof body === 'object' &&
      (body.status === false || body.success === false);

    if (isBusinessError) {
      const message = getErrorMessage(response.status, response.data as ApiErrorBody);
      // Log là ✖ chứ không ✔: HTTP 200 nhưng nghiệp vụ HỎNG. In "200 OK" ở đây
      // là đúng thứ khiến người đọc log tưởng request ổn rồi đi tìm bug chỗ khác.
      logLine('✖', method, `${response.config.url ?? ''} (${elapsed}ms)`, message);

      const error = new AxiosError(
        message,
        'ERR_BUSINESS',
        response.config,
        response.request,
        response,
      ) as AxiosError & ToastMarkedError;

      if (!response.config.skipErrorToast && appConfig.enableErrorToast) {
        showToast('error', message);
        error.__toastShown = true;
      }
      return Promise.reject(error);
    }

    logLine('✅', method, `${response.config.url ?? ''} (${elapsed}ms)`);
    return response;
  },

  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config;
    const status = error.response?.status;

    if (appConfig.enableApiLogging && original) {
      const elapsed = Date.now() - (original.__startedAt ?? Date.now());
      logger.warn(
        `✖ ${original.method?.toUpperCase() ?? 'GET'} ${sanitizeLogUrl(original.url ?? '')} ` +
          `(${status ?? 'mạng'} · ${elapsed}ms)`,
      );
    }

    /**
     * ── 401 ─────────────────────────────────────────────────────────────────
     *
     * ⛔ MỌI ca 401 phải kết thúc ở MỘT trong ba chỗ, tuyệt đối không có lối
     * rơi ra ngoài:
     *   · làm mới được token → phát lại request gốc;
     *   · phiên chết         → `purgeSession()` + toast, guard tự đưa về đăng nhập;
     *   · hỏng tạm thời      → toast như lỗi thường, GIỮ nguyên phiên.
     *
     * ⚠️ Đây từng là một HỐ ĐEN: nhánh này bọc trong `appConfig.enableRefreshToken` còn khối toast
     * bên dưới loại trừ `status !== 401`. Đặt `EXPO_PUBLIC_ENABLE_REFRESH_TOKEN=false` là 401 rơi qua
     * CẢ HAI — không dọn phiên, không toast, không điều hướng; store vẫn `authenticated` nên guard ở
     * `app/(app)/_layout.tsx` không kích hoạt và mọi request hỏng IM LẶNG, vĩnh viễn. `.env.example`
     * và `env.config.ts` đều hứa "Tắt khi BE chưa có endpoint refresh — lúc đó 401 là đăng xuất
     * luôn"; khối dưới đây là lời hứa đó.
     *
     * ⛔ `skipAuthRefresh` (đăng nhập, refresh) và 401 mã `AUTH_001` (`isCredentialRejection`: bật sinh
     * trắc học, xoá tài khoản…) đứng NGOÀI tất cả: đó là SAI MẬT KHẨU, dọn phiên là đá người dùng ra.
     */
    if (status === 401 && original && !original.skipAuthRefresh && !isCredentialRejection(error)) {
      /**
       * `__retried` đã bật = vừa refresh xong, lượt phát lại VẪN ăn 401. Không
       * được refresh tiếp: mỗi vòng tốn một lần xoay refresh token phía backend
       * và backend có thể coi đó là tấn công.
       */
      const canRefresh = appConfig.enableRefreshToken && !original.__retried;

      if (!canRefresh) {
        /**
         * Không còn đường cứu nào ⇒ phiên chết thật. Hai ca:
         *   · cờ refresh TẮT — BE chưa có endpoint refresh, 401 là đăng xuất luôn;
         *   · `__retried` — token mới vẫn bị từ chối (sai audience/scope, hoặc
         *     backend đã thu hồi phiên).
         *
         * Chỉ dọn store; ⛔ tầng core KHÔNG gọi router (lý do đầy đủ ở
         * `client.refresh.ts`). `app/(app)/_layout.tsx` đang theo dõi trạng thái
         * phiên nên nó tự chuyển về màn đăng nhập.
         */
        await purgeSession();
      } else if (isRefreshInFlight()) {
        // Xếp hàng chờ token mới rồi chạy lại request gốc.
        return waitForNewToken().then((token) => {
          original.__retried = true;
          original.headers?.set('Authorization', `Bearer ${token}`);
          return apiClient(original);
        });
      } else {
        original.__retried = true;
        beginRefresh();

        /**
         * ⛔ Vùng tới hạn kết thúc ĐÚNG lúc xả hàng đợi — lượt phát lại request
         * gốc nằm NGOÀI nó.
         *
         * Nếu viết `return await apiClient(original)` bên trong `try` thì
         * `endRefresh()` phải đợi cả lượt phát lại. Suốt khoảng đó cờ vẫn bật
         * nhưng hàng đợi đã rỗng: request nào ăn 401 đúng lúc này sẽ tự xếp vào
         * hàng đợi mà không còn ai xả — promise treo VĨNH VIỄN. `timeout` của
         * axios không cứu được, vì nó chỉ áp cho lời gọi HTTP chứ không áp cho
         * chuỗi promise của interceptor. Người dùng thấy spinner quay mãi.
         *
         * Nếu lượt phát lại lại ăn 401 nữa thì request đó rơi vào nhánh
         * `!canRefresh` ở trên — dọn phiên, không lặp vô hạn.
         */
        let newToken: string | null;
        try {
          newToken = await refreshAccessToken();
          // Trả LẠI chính AxiosError 401 cho hàng đợi khi refresh hỏng — xem
          // chú thích của `drainQueue`.
          drainQueue(newToken ? null : error, newToken);
        } catch (refreshError) {
          drainQueue(refreshError, null);
          endRefresh();
          return await Promise.reject(refreshError);
        }
        endRefresh();

        if (newToken) {
          original.headers?.set('Authorization', `Bearer ${newToken}`);
          return await apiClient(original);
        }
        /**
         * Refresh không cứu được — rơi xuống khối toast bên dưới, và ⛔ KHÔNG
         * dọn phiên ở đây:
         *   · `unauthenticated` — `refreshAccessToken` đã dọn rồi;
         *   · `unavailable`     — mất sóng/5xx, phiên vẫn còn hiệu lực và
         *     refresh token trong kho khoá là thứ duy nhất cứu được nó khi có
         *     sóng lại (điều cấm số 6 của base).
         */
      }
    }

    // 403 AUTH_011/012 (khoá/chờ xoá ở máy khác): phiên chết dù token còn hạn — xem `isAccountBlocked`.
    if (original && !original.skipAuthRefresh && isAccountBlocked(error)) await purgeSession();

    /**
     * Xử lý lỗi TẬP TRUNG — feature KHÔNG cần tự toast.
     *
     * Áp cho MỌI phương thức, kể cả GET: tải dữ liệu hỏng mà im lặng thì người
     * dùng chỉ thấy màn trống và không biết vì sao — họ sẽ kết luận là "không có
     * dữ liệu" chứ không phải "mất mạng", rồi báo sai vấn đề cho đội hỗ trợ.
     *
     * Ba thứ giữ cho toast khỏi nhiễu: `retry: 1` ở query-client nên một query
     * hỏng chỉ bắn hai lần, `refetchOnWindowFocus: false` nên không có mưa
     * request khi chuyển app, và `showToast` tự gộp toast trùng nội dung trong 3s.
     *
     * ⛔ 401 KHÔNG còn bị loại trừ ở đây. Tới được dòng này nghĩa là luồng
     * refresh đã bó tay (hoặc bị tắt hẳn) — và một 401 câm là đúng thứ khiến
     * người dùng ngồi nhìn màn hình trống mà tưởng "không có dữ liệu". Ca 401
     * ĐƯỢC refresh cứu thì đã `return` ở trên rồi, nên không sinh toast thừa.
     * Chỉ còn `skipErrorToast` (màn đăng nhập tự hiện lỗi dưới ô nhập) và cờ
     * `__toastShown` chống toast trùng.
     */
    const marked = error as AxiosError & ToastMarkedError;
    const shouldToast =
      appConfig.enableErrorToast && !original?.skipErrorToast && !marked.__toastShown;

    if (shouldToast) {
      const message = getApiErrorMessage(error);
      showToast('error', message);
      marked.__toastShown = true;
      try {
        // Ghi đè `error.message` bằng câu đã dịch, để chỗ nào lỡ đọc thẳng
        // `error.message` cũng không lộ "Request failed with status code 400".
        marked.message = message;
      } catch {
        // Vài môi trường để `message` chỉ đọc — bỏ qua an toàn.
      }
    }

    return Promise.reject(error);
  },
);
