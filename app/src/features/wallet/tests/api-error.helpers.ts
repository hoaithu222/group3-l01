import { AxiosError } from 'axios';

/** Lỗi API giả dạng axios cho test — `data.error.code/details` đúng hình BE trả. */
export function apiError(
  status: number,
  code?: string,
  details?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new AxiosError('lỗi', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: code ? { error: { code, details }, success: false } : {},
    headers,
    status,
    statusText: '',
  });
}
