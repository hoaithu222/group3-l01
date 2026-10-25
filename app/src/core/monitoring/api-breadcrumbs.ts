import { isAxiosError, type AxiosInstance } from 'axios';

import { scrubUrl } from './scrub';

/** Hình dạng lỗi của BE (`{ success:false, error:{ code, message }, requestId }`) — chỉ đọc hai trường dùng làm nhãn. */
interface ApiErrorEnvelope {
  requestId?: unknown;
  error?: { code?: unknown };
}

export interface ApiErrorBreadcrumb {
  code?: string;
  requestId?: string;
  status?: number;
  method?: string;
  /** Đường dẫn KHÔNG query, mã bí mật đã che. */
  url: string;
}

/** Trích nhãn vô hại từ lỗi axios (không body, không header, không query). `null` nếu không phải lỗi axios. */
export function describeApiError(error: unknown): ApiErrorBreadcrumb | null {
  if (!isAxiosError(error)) return null;
  const body = error.response?.data as ApiErrorEnvelope | undefined;
  return {
    code: typeof body?.error?.code === 'string' ? body.error.code : undefined,
    requestId: typeof body?.requestId === 'string' ? body.requestId : undefined,
    status: error.response?.status,
    method: error.config?.method?.toUpperCase(),
    url: scrubUrl(error.config?.url ?? ''),
  };
}

/**
 * Mỗi request API thất bại (kể cả sau khi refresh token đã thử) để lại MỘT breadcrumb `{ code, requestId, url không query }` (app.md §4) — khi sự kiện Sentry tới, dòng
 * này cho biết `requestId` để tra log BE. Interceptor đăng ký SAU interceptor của `client.ts` nên chỉ thấy lỗi còn lại; luôn `Promise.reject` lại nguyên lỗi (không đổi hành vi). Trả hàm gỡ interceptor.
 */
export function attachApiBreadcrumbs(client: AxiosInstance, add: (breadcrumb: { category: string; level: 'error'; message: string; data: object }) => void): () => void {
  const id = client.interceptors.response.use(undefined, (error: unknown) => {
    const info = describeApiError(error);
    if (info) add({ category: 'api', level: 'error', message: `${info.method ?? 'REQ'} ${info.url} → ${info.status ?? 'ERR'}${info.code ? ` ${info.code}` : ''}`, data: info });
    return Promise.reject(error);
  });
  return () => client.interceptors.response.eject(id);
}
