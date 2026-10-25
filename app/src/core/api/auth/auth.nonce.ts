import { isAxiosError } from 'axios';

import { apiClient } from '../client';
import { getErrorCode } from '../client.helpers';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS } from './auth.api';
import type { NonceResponse } from './auth.types';

/**
 * Nonce dùng MỘT LẦN (D-27) — bắt buộc ngay trước `login` / `register` /
 * `biometric/login`. Tách khỏi `auth.service.ts` (file đó chạm trần 150 dòng).
 */

/**
 * Lấy một mã MỚI.
 *
 * ⛔ `skipAuthRefresh` + `skipErrorToast` giống hệt các lượt gọi đăng nhập: đây LUÔN là bước
 * mở đầu của một luồng CHƯA đăng nhập, 401/lỗi mạng ở đây không phải "phiên hết hạn" và lỗi
 * phải hiện NGAY TRONG form gọi nó, không phải toast nổi lên rồi biến mất.
 */
export async function fetchNonce(): Promise<string> {
  const response = await apiClient.get<NonceResponse>(AUTH_ENDPOINTS.NONCE, {
    skipAuthRefresh: true,
    skipErrorToast: true,
  });
  return unwrapData<NonceResponse>(response).nonce;
}

/** BE gộp "chưa từng cấp / đã dùng / hết hạn" vào MỘT mã — không thể (và không cần) phân biệt. */
const NONCE_REJECTED = 'AUTH_018';

export function isNonceRejected(error: unknown): boolean {
  return isAxiosError(error) && getErrorCode(error) === NONCE_REJECTED;
}

/**
 * Chạy `send(nonce)` với nonce MỚI; nếu BE từ chối nonce (`AUTH_018`) thì lấy nonce khác và
 * thử lại ĐÚNG MỘT LẦN — không hỏi lại người dùng.
 *
 * Nonce chết giữa đường là chuyện thường trên di động: mạng chậm làm lượt gửi tới sau TTL
 * 120 giây, hoặc lượt gửi trước đó đã tiêu thụ nonce rồi mất phản hồi. Hai lần liền vẫn bị từ
 * chối thì để lỗi nổi lên (`toAuthErrorMessage`) — thử tiếp nữa chỉ đốt lượt của `authLimiter`.
 *
 * ⛔ Lỗi KHÁC `AUTH_018` (sai mật khẩu, mất mạng…) ném thẳng, KHÔNG thử lại: gửi lại mật khẩu
 * sai là tự làm hỏng bộ đếm chống dò của BE.
 */
export async function withFreshNonce<T>(send: (nonce: string) => Promise<T>): Promise<T> {
  try {
    return await send(await fetchNonce());
  } catch (error) {
    if (!isNonceRejected(error)) throw error;
    return send(await fetchNonce());
  }
}
