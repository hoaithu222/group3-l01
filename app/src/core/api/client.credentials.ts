import type { AxiosError } from 'axios';

import { getErrorCode } from './client.helpers';

/** Mã BE dành RIÊNG cho "email/mật khẩu không đúng" — không bao giờ là lỗi token. */
const WRONG_CREDENTIALS = 'AUTH_001';

/**
 * 401 vì SAI MẬT KHẨU (mã `AUTH_001`) chứ không phải vì access token hết hạn.
 *
 * ⛔ Interceptor 401 KHÔNG được làm mới/dọn phiên cho lỗi này. Các màn xác nhận mật khẩu
 * của người ĐÃ đăng nhập (bật sinh trắc học, xoá tài khoản) gọi với phiên hợp lệ: nếu coi
 * đây là "token hết hạn" thì interceptor làm mới token (xoay refresh token vô ích), phát
 * lại, ăn 401 lần hai và `purgeSession()` — người dùng bị ĐÁ RA CHỈ VÌ GÕ SAI MẬT KHẨU.
 *
 * Token hết hạn/thu hồi mang mã khác (`AUTH_002/003/004`), nên khớp mã là đủ an toàn.
 */
export function isCredentialRejection(error: AxiosError): boolean {
  return error.response?.status === 401 && getErrorCode(error) === WRONG_CREDENTIALS;
}

/** Mã 403 của BE: tài khoản đang bị KHOÁ (`AUTH_011`) hoặc CHỜ XOÁ (`AUTH_012`). */
const ACCOUNT_BLOCKED_CODES: ReadonlySet<string> = new Set(['AUTH_011', 'AUTH_012']);

/**
 * Request có phiên bị BE chặn vì TRẠNG THÁI TÀI KHOẢN (khoá, hoặc vừa yêu cầu xoá ở máy khác).
 *
 * ⛔ Đây là phiên chết dù access token chưa hết hạn, và nó KHÔNG phải 401 nên không đi qua luồng
 * làm mới: `authenticateToken` kiểm trạng thái TRƯỚC `sessionVersion`, nên phiên bị thu hồi của
 * tài khoản chờ xoá luôn nhận 403 chứ không 401. Không dọn thì app ngồi yên với token chết, mọi
 * request kế tiếp cùng toast lỗi, và socket (BE đã ngắt, socket.io không tự nối lại) im lặng.
 * Lượt đăng nhập/sinh trắc học (`skipAuthRefresh`) nhận đúng mã này một cách hợp lệ — loại ở nơi gọi.
 */
export function isAccountBlocked(error: AxiosError): boolean {
  return error.response?.status === 403 && ACCOUNT_BLOCKED_CODES.has(getErrorCode(error));
}
