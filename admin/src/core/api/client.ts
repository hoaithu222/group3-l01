/**
 * Axios client dùng chung — auth JWT, xử lý lỗi tập trung, refresh 401.
 *
 * Ba việc đáng chú ý ở file này:
 *  1. `paramsSerializer` lặp key cho mảng (hợp .NET) thay vì `key[]=`.
 *  2. Phát hiện lỗi nghiệp vụ mà BE vẫn trả HTTP 2xx.
 *  3. Refresh 401 xếp hàng — cơ chế nằm ở `client.refresh.ts`.
 */
import axios, { AxiosError } from 'axios';
import type { AxiosRequestHeaders, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, purgeAuthSession } from '@/core/api/session';
import type { ApiErrorResponse, RequestConfig } from '@/core/api/client.types';
import { showToast } from '@/shared/utils/toast.utils';
import { getErrorMessage, redactSecrets, shouldLogRequest } from '@/core/api/client.helpers';
import { appConfig } from '@/core/config/env.config';
import {
  isAccountEndedResponse,
  refreshAndReplay,
  shouldAttemptRefresh,
  type RetriableRequestConfig,
} from '@/core/api/client.refresh';

/**
 * Serialize params GET: mảng thành `key=v1&key=v2` (lặp key) cho .NET hiểu.
 * Mặc định axios ra `ids[]=1&ids[]=2` — model binder của .NET không nhận.
 */
const paramsSerializer = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
};

export const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: appConfig.apiTimeout,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  // BẮT BUỘC: refresh token nằm trong cookie HttpOnly do BE set.
  withCredentials: true,
  paramsSerializer,
});

/** Đánh dấu lên error để consumer (React Query `onError`) không toast trùng. */
type ToastMarkedError = AxiosError & { __toastShown?: boolean };

// ─── Request interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      const headers = (config.headers ?? {}) as AxiosRequestHeaders;
      headers.Authorization = `Bearer ${token}`;
      config.headers = headers;
    }

    // FormData phải để trình duyệt tự đặt `Content-Type` kèm boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    if (shouldLogRequest(appConfig)) {
      console.log(
        `🌐 ${config.method?.toUpperCase()} ${config.url}`,
        config.data instanceof FormData ? '[FormData]' : redactSecrets(config.data),
      );
      if (config.params) console.log('📋 Params:', redactSecrets(config.params));
    }

    return config;
  },
  (error: AxiosError) => {
    if (appConfig.enableApiLogging) console.error('❌ Lỗi request:', error);
    return Promise.reject(error);
  },
);

// ─── Response interceptor ────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (shouldLogRequest(appConfig)) {
      console.log(`✅ Response ${response.config.url}:`, redactSecrets(response.data));
    }

    /**
     * Lỗi nghiệp vụ trả KÈM HTTP 2xx:
     *   { status: false, errorCode: "...", parameters }
     *   { success: false, error: { ... } }
     * Axios coi 2xx là thành công → phải tự phát hiện ở đây, toast message của
     * BE rồi reject, nếu không mutation sẽ chạy `onSuccess` cho một lỗi.
     */
    const cfg = response.config as RequestConfig;
    const body = response.data as { status?: boolean; success?: boolean } | undefined;
    const isBusinessError =
      !cfg?.skipBusinessErrorHandling &&
      !!body &&
      typeof body === 'object' &&
      (body.status === false || body.success === false);

    if (isBusinessError) {
      const msg = getErrorMessage(response.status, response.data as Record<string, unknown>);
      const businessError: ToastMarkedError = new AxiosError(
        msg,
        'ERR_BUSINESS',
        response.config,
        response.request,
        response,
      );
      if (!cfg?.skipErrorToast && appConfig.enableErrorToast) {
        showToast('error', msg);
        businessError.__toastShown = true;
      }
      return Promise.reject(businessError);
    }

    return response;
  },

  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = getErrorMessage(
      status,
      errorData as Record<string, unknown> | undefined,
      error.message || 'Đã xảy ra lỗi',
    );

    const skipErrorToast = originalRequest?.skipErrorToast || !appConfig.enableErrorToast;

    /**
     * Toast đúng MỘT lần: đánh dấu `__toastShown` để `onError` phía consumer
     * biết đã có toast (xem `isErrorHandled` ở `@/core/http`). Đồng thời ghi đè
     * `error.message` bằng message đã map, để chỗ nào lỡ đọc `error.message`
     * cũng không lộ "Request failed with status code 400" ra giao diện.
     */
    const showErrorToast = (msg: string): void => {
      showToast('error', msg);
      const marked = error as ToastMarkedError;
      marked.__toastShown = true;
      try {
        marked.message = msg;
      } catch {
        // Vài môi trường để `message` readonly — bỏ qua an toàn.
      }
    };

    // 401 của request THƯỜNG: làm mới token (MỘT lượt cho cả loạt) rồi phát lại. Cơ chế —
    // hàng đợi, vùng tới hạn, `_retry` chặn lặp vô hạn — nằm ở `client.refresh.ts`.
    // Endpoint xác thực công khai (sai mật khẩu, token đặt lại sai…) KHÔNG đi nhánh này.
    if (originalRequest && shouldAttemptRefresh(originalRequest, status)) {
      return refreshAndReplay(error, originalRequest, (config) => apiClient(config));
    }

    // 403 `AUTH_011`/`AUTH_012` ở request có phiên: tài khoản vừa bị khoá/chờ xoá → phiên
    // chết ngay. Không toast: trang đăng nhập sẽ nói rõ lý do.
    if (isAccountEndedResponse(error, originalRequest)) {
      purgeAuthSession('locked');
      return Promise.reject(error);
    }

    /**
     * Xử lý lỗi tập trung — feature KHÔNG cần tự toast.
     * `getErrorMessage` ưu tiên message BE trả về ở mọi định dạng; chỉ khi BE
     * không trả message nào mới rơi xuống bảng tra theo HTTP status.
     */
    if (!skipErrorToast) showErrorToast(errorMessage);

    if (originalRequest?.customErrorHandler && errorData) {
      originalRequest.customErrorHandler(errorData);
    }

    if (appConfig.enableApiLogging) {
      console.error('❌ Lỗi API:', {
        status,
        url: originalRequest?.url,
        message: errorMessage,
        data: errorData,
      });
    }

    return Promise.reject(error);
  },
);
