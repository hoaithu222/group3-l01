/**
 * Nonce dùng MỘT LẦN cho các request đăng nhập/đăng ký (D-27) và cờ chung cho mọi
 * lời gọi xác thực mà LỖI PHẢI HIỆN NGAY TRONG FORM.
 *
 * BE đòi `nonce` (lấy từ `GET /auth/nonce`, sống 120 s) trong body `login` /
 * `register` và tiêu thụ nó ngay sau khi validate body, TRƯỚC khi so mật khẩu. Nonce
 * chưa từng cấp / đã dùng / hết hạn đều trả CÙNG một lỗi `AUTH_018` — nên gặp mã đó
 * thì request CHƯA HỀ được xử lý (không tốn lượt thử mật khẩu, không tạo tài khoản),
 * và phát lại với nonce mới là an toàn.
 */
import { isAxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import { extractErrorCode } from '@/core/api/error.handler';
import type { ApiResponse } from '@/shared/types';
import { authApi } from './auth.api';
import type { NonceResponse } from './auth.types';

/**
 * Cờ cho lời gọi xác thực mà trang tự vẽ lỗi trong khung form:
 *  - `skipAuthRefresh`: 401 ở đây là "sai thông tin", KHÔNG phải "token hết hạn" —
 *    thiếu cờ này thì sai mật khẩu bị coi là phiên chết (xem `AUTH_NO_REFRESH_PATHS`).
 *  - `skipErrorToast`: form đã có `<Callout>`; toast thêm là hai thông báo cho một lỗi.
 */
export const FORM_AUTH_REQUEST = { skipAuthRefresh: true, skipErrorToast: true } as RequestConfig;

/** GET /auth/nonce — cấp mã dùng một lần cho request xác thực nhạy cảm kế tiếp. */
export async function fetchNonce(): Promise<string> {
  const res = await apiClient.get<ApiResponse<NonceResponse>>(authApi.nonce, FORM_AUTH_REQUEST);
  return res.data.data.nonce;
}

/** Lỗi này có phải "nonce bị từ chối" (đã dùng / hết hạn / lạc instance BE) không. */
export function isNonceRejected(error: unknown): boolean {
  return (
    isAxiosError(error) && error.response?.status === 401 && extractErrorCode(error) === 'AUTH_018'
  );
}

/**
 * Lấy nonce mới rồi gọi `send(nonce)`. Nếu BE từ chối nonce (`AUTH_018`) thì lấy một
 * nonce KHÁC và thử lại ĐÚNG MỘT LẦN — lần hai vẫn bị từ chối thì báo lỗi, không lặp
 * (nonce hỏng liên tục là sự cố hạ tầng, không phải may rủi).
 *
 * `await fetchNonce()` không bọc `try`: nonce lấy hỏng thì dừng ngay, KHÔNG gửi
 * request thật với nonce rỗng.
 */
export async function withNonce<T>(send: (nonce: string) => Promise<T>): Promise<T> {
  try {
    return await send(await fetchNonce());
  } catch (error) {
    if (!isNonceRejected(error)) throw error;
    return send(await fetchNonce());
  }
}
