/**
 * Đổi lỗi của luồng xác thực thành MỘT câu tiếng Việt cho người dùng.
 *
 * Tại sao không dùng thẳng `extractErrorMessage` (message của BE)?
 *  - Nghĩa của 401 phụ thuộc form đang gọi (`flow`), không phụ thuộc mã lỗi: BE bản mới tách
 *    `AUTH_001` (sai mật khẩu / mật khẩu hiện tại) và `AUTH_008` (token đặt lại sai) khỏi
 *    `AUTH_002` ("token không hợp lệ"), nhưng bản cũ dồn cả ba vào `AUTH_002` — FE/BE triển
 *    khai độc lập nên phải đúng với cả hai. Chỉ nơi gọi mới biết 401 đó nghĩa là gì.
 *  - Message BE có thể chứa từ nội bộ ("nonce", tên mã lỗi) hoặc bằng tiếng Anh khi
 *    lỗi đến từ tầng hạ tầng (proxy trả 502 HTML…).
 *  - Đứt mạng và 5xx cần câu "kiểm tra kết nối", KHÔNG phải "sai thông tin".
 *
 * ⛔ KHÔNG được phân biệt "email không tồn tại" với "sai mật khẩu": đăng nhập sai luôn ra
 * cùng một câu, và `forgot-password` không bao giờ nói email có tồn tại hay không.
 * (Trạng thái tài khoản — khoá, chờ xoá — là thứ BE chủ động trả về cho người đã qua
 * bước xác thực; nếu BE lộ chúng trước bước so mật khẩu thì đó là lỗi của BE.)
 */
import { isAxiosError, type AxiosError } from 'axios';

import {
  extractErrorCode,
  extractErrorDetails,
  extractRetryAfterSeconds,
  isConnectivityError,
} from '@/core/api/error.handler';

export type AuthFlow = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'change-password';

const GENERIC = 'Không thực hiện được. Vui lòng thử lại sau.';
const OFFLINE = 'Không thể kết nối đến máy chủ. Kiểm tra mạng rồi thử lại.';
const SERVER_ERROR = 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';

/** Mã lỗi có nghĩa CỐ ĐỊNH bất kể form nào gọi. */
const CODE_MESSAGES: Record<string, string> = {
  AUTH_011: 'Tài khoản đã bị khoá. Liên hệ quản trị viên để được hỗ trợ.',
  AUTH_012:
    'Tài khoản đang chờ xoá. Liên hệ quản trị viên hoặc huỷ yêu cầu xoá trong ứng dụng để tiếp tục.',
  // Chỉ tới được người dùng sau khi đã tự thử lại một lần (`withNonce`) — nói bằng lời thường.
  AUTH_018: 'Yêu cầu đã hết hạn. Vui lòng thử lại.',
  // Phiên bản phiên đã đổi (vừa đổi vai trò/mật khẩu ở nơi khác) — KHÔNG phải "sai mật khẩu hiện tại"
  // dù BE cũng trả 401: tải lại để lấy token mới.
  AUTH_004: 'Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang rồi thử lại.',
};

/** 401 nghĩa là gì ở từng form. */
const UNAUTHORIZED: Record<AuthFlow, string> = {
  login: 'Email hoặc mật khẩu không đúng.',
  register: GENERIC,
  'forgot-password': GENERIC,
  'reset-password':
    'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại hướng dẫn.',
  'change-password': 'Mật khẩu hiện tại không đúng.',
};

/** Câu "thử lại sau N giây/phút" từ `Retry-After` của 429. */
function rateLimitMessage(error: AxiosError): string {
  const seconds = extractRetryAfterSeconds(error);
  if (seconds === null) return 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  const wait = seconds < 60 ? `${seconds} giây` : `${Math.ceil(seconds / 60)} phút`;
  return `Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${wait}.`;
}

/**
 * Câu lỗi đầu tiên trong `details` của VAL_001 (`{ trường: [câu lỗi] }` — dạng
 * `flatten().fieldErrors` của Zod ở BE), hoặc `null`.
 */
export function firstValidationMessage(error: AxiosError): string | null {
  const details = extractErrorDetails(error);
  if (details === null || typeof details !== 'object') return null;
  for (const messages of Object.values(details as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === 'string' && first.trim() !== '') return first.trim();
  }
  return null;
}

/** Thông điệp cho người dùng của MỘT lỗi trong luồng `flow`. Luôn trả chuỗi, không ném. */
export function resolveAuthError(error: unknown, flow: AuthFlow): string {
  if (!isAxiosError(error)) return GENERIC;
  if (isConnectivityError(error)) return OFFLINE;

  const status = error.response?.status;
  if (status === 429) return rateLimitMessage(error);
  if (status !== undefined && status >= 500) return SERVER_ERROR;

  const byCode = CODE_MESSAGES[extractErrorCode(error)];
  if (byCode) return byCode;

  if (status === 401) return UNAUTHORIZED[flow];
  if (status === 409 && flow === 'register') return 'Email này đã được đăng ký.';
  if (status === 400) {
    // Không hé lộ thêm gì cho `forgot-password`: chỉ có thể sai định dạng email.
    if (flow === 'forgot-password') return 'Email không hợp lệ.';
    return firstValidationMessage(error) ?? 'Thông tin nhập vào không hợp lệ.';
  }
  if (status === 403) return FORBIDDEN;
  return GENERIC;
}
