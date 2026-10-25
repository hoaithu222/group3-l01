/**
 * Types for HTTP client (axios): request options, error shape, refresh response.
 * Use for interceptors and API wrappers.
 */
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export type { AxiosInstance };

export interface RequestConfig extends AxiosRequestConfig {
  /** Skip default error toast for this request */
  skipErrorToast?: boolean;
  /**
   * Bỏ qua việc interceptor tự reject + toast khi response 2xx nhưng body báo
   * lỗi nghiệp vụ (`status: false` / `success: false`). Bật cờ này cho các API
   * mà CALLER tự xử lý `status:false` trong `onSuccess` (vd: members,
   * organization, upload, gantt-import) để không bị reject/toast trùng.
   */
  skipBusinessErrorHandling?: boolean;
  /** Skip 401 refresh token flow */
  skipAuthRefresh?: boolean;
  /** Custom error handler (e.g. form validation) */
  customErrorHandler?: (error: ApiErrorResponse) => void;
  _retry?: boolean;
}

export interface BaseResponse {
  status: boolean;
  errorCode: string;
  parameters: string;
}

export interface HttpClient {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<AxiosResponse<ApiResponse<T>>>;

  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    config?: RequestConfig,
  ): Promise<AxiosResponse<ApiResponse<T>>>;

  put<T = unknown, D = unknown>(
    url: string,
    data?: D,
    config?: RequestConfig,
  ): Promise<AxiosResponse<ApiResponse<T>>>;

  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    config?: RequestConfig,
  ): Promise<AxiosResponse<ApiResponse<T>>>;

  delete<T = unknown>(url: string, config?: RequestConfig): Promise<AxiosResponse<ApiResponse<T>>>;
}

export interface ApiErrorResponse {
  message?: string;
  errors?: Record<string, string[]>;
  code?: string;
  [key: string]: unknown;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface ApiResponse<T = unknown> {
  items: unknown;
  status: boolean;
  data?: T;
  errorCode?: string;
  parameters?: unknown;
}
// trạng thái response
export interface BaseResponse {
  status: boolean;
  errorCode: string;
  parameters: string;
}
