import { isAxiosError } from 'axios';

import { UNKNOWN_ERROR_MESSAGE } from '@/shared/constants/error-codes';

import { getErrorCode, toErrorMessage } from '../client.helpers';

/**
 * Câu lỗi tiếng Việt cho các FORM xác thực — dịch theo NGỮ CẢNH chứ không chỉ theo mã.
 *
 * ── Vì sao `toErrorMessage` trần không đủ ────────────────────────────────────
 * `getErrorMessage` ưu tiên bảng mã lỗi hơn câu của BE. Mà BE ném MỌI lỗi 401 của luồng xác
 * thực bằng `UnauthorizedError(message)` KHÔNG kèm mã, tức là mặc định `AUTH_002`
 * ("Token không hợp lệ" trong bảng của app). Kết quả: gõ sai mật khẩu ở màn Đăng nhập hiện
 * "Token không hợp lệ", đổi mật khẩu sai mật khẩu cũ cũng vậy, mã đặt lại hết hạn cũng vậy.
 * Ngữ cảnh (form nào đang gọi) mới nói được 401 nghĩa là gì.
 *
 * ⚠️ Khi BE trả đúng mã (`AUTH_001` cho sai mật khẩu, `AUTH_008` cho mã đặt lại) thì các
 * nhánh dưới vẫn đúng — chúng khớp CẢ mã cũ lẫn mã mới.
 */
export type AuthFormContext =
  | 'changePassword'
  | 'confirmPassword'
  | 'forgotPassword'
  | 'login'
  | 'register'
  | 'resetPassword'
  | 'socialLogin';

/**
 * Lỗi do CHÍNH app ném, với câu tiếng Việt viết sẵn cho người dùng — an toàn để hiện NGUYÊN VĂN.
 *
 * ⛔ Mọi lỗi KHÔNG phải axios mà không phải loại này (`TypeError`, lỗi kho khoá…) bị đổi thành câu
 * chung: hiện `error.message` của chúng là đưa chi tiết kỹ thuật ("Cannot read properties of
 * undefined") vào dải `Alert` dưới ô nhập.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

const MESSAGES = {
  emailTaken: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.',
  // Không nói "nonce" cho người dùng — thuật ngữ kỹ thuật. Tới được đây nghĩa là ĐÃ thử lại một lần.
  nonceRejected: 'Phiên xác thực đã hết hạn. Vui lòng thử lại.',
  resetTokenInvalid: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.',
  // Đăng nhập Google (`AUTH_022`/`AUTH_023`/503). Chỉ ngữ cảnh `socialLogin` — `AUTH_022` không phải "sai mật khẩu".
  socialExpired: 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.',
  socialUnavailable:
    'Đăng nhập bằng Google tạm thời không khả dụng. Vui lòng thử lại sau hoặc đăng nhập bằng email.',
  socialUnverified: 'Tài khoản Google này chưa có email đã xác minh nên chưa thể đăng nhập.',
  // Tài khoản chỉ-Google không có mật khẩu: lối khôi phục duy nhất là "Quên mật khẩu" (đặt mật khẩu rồi khôi phục).
  socialPendingDeletion:
    'Tài khoản đang chờ xoá. Hãy dùng "Quên mật khẩu" để đặt mật khẩu rồi khôi phục tài khoản.',
  wrongCredentials: 'Email hoặc mật khẩu không đúng.',
  wrongCurrentPassword: 'Mật khẩu hiện tại không đúng.',
  // Ô xác nhận mật khẩu của người ĐÃ đăng nhập (xoá tài khoản…): không có ô email nên đừng nhắc email.
  wrongPassword: 'Mật khẩu không đúng.',
} as const;

/** Mã 401 nghĩa là "sai mật khẩu" — gồm cả mặc định `AUTH_002` mà BE hiện đang trả. */
const WRONG_PASSWORD_CODES: ReadonlySet<string> = new Set(['AUTH_001', 'AUTH_002', 'USER_003']);
const RESET_TOKEN_CODES: ReadonlySet<string> = new Set(['AUTH_002', 'AUTH_008']);

/**
 * Đăng nhập bị `AUTH_012`: tài khoản đang chờ xoá (ân hạn). BE khoá đăng nhập và đã thu hồi mọi phiên
 * (D-02), nên lối duy nhất còn lại là huỷ yêu cầu xoá ở màn "Khôi phục tài khoản".
 */
export function isAccountPendingDeletion(error: unknown): boolean {
  return isAxiosError(error) && getErrorCode(error) === 'AUTH_012';
}

/**
 * Mốc hết ân hạn xoá (ISO) mà BE kèm trong `error.details.deletionGraceUntil` của `AUTH_012` — chỉ khi mật khẩu/HMAC/refresh
 * ĐÚNG (không lộ trạng thái tài khoản cho người dò). Thiếu (BE cũ, hoặc lỗi khác) ⇒ `undefined`: màn "Khôi phục tài khoản" hiện
 * câu không nêu ngày.
 */
export function getDeletionGraceUntil(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as { error?: { details?: unknown } } | undefined)?.error
    ?.details;
  const value =
    details !== null && typeof details === 'object'
      ? (details as Record<string, unknown>).deletionGraceUntil
      : undefined;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Xoá tài khoản bị chặn vì người dùng đang là CHỦ nhóm (`USER_010`) — phải chuyển quyền trước. */
export function isOwnershipBlockingDeletion(error: unknown): boolean {
  return isAxiosError(error) && getErrorCode(error) === 'USER_010';
}

export function toAuthErrorMessage(error: unknown, context: AuthFormContext): string {
  // Không phải lỗi HTTP: chỉ lỗi do app chủ ý ném (`UserFacingError`) mới được hiện nguyên văn.
  if (!isAxiosError(error)) {
    return error instanceof UserFacingError ? error.message : UNKNOWN_ERROR_MESSAGE;
  }
  // Không có phản hồi (mất mạng, quá hạn): `toErrorMessage` đã nói đúng.
  if (!error.response) return toErrorMessage(error);

  const { status } = error.response;
  const code = getErrorCode(error);

  if (code === 'AUTH_018') return MESSAGES.nonceRejected;

  if (context === 'socialLogin') {
    if (code === 'AUTH_022') return MESSAGES.socialExpired;
    if (code === 'AUTH_023') return MESSAGES.socialUnverified;
    if (code === 'AUTH_012') return MESSAGES.socialPendingDeletion;
    // 503 = BE chưa cấu hình Firebase (fail-closed) hoặc Firebase không với tới được — thử lại được, không phải lỗi của người dùng.
    if (status === 503) return MESSAGES.socialUnavailable;
  }

  if (status === 401) {
    if (context === 'login' && WRONG_PASSWORD_CODES.has(code)) return MESSAGES.wrongCredentials;
    if (context === 'changePassword' && WRONG_PASSWORD_CODES.has(code)) {
      return MESSAGES.wrongCurrentPassword;
    }
    if (context === 'confirmPassword' && WRONG_PASSWORD_CODES.has(code))
      return MESSAGES.wrongPassword;
    if (context === 'resetPassword' && RESET_TOKEN_CODES.has(code))
      return MESSAGES.resetTokenInvalid;
  }
  // BE trả 404 cho "người dùng của mã này không còn" — nói CHUNG với mã sai, đừng lộ tài khoản.
  if (context === 'resetPassword' && status === 404) return MESSAGES.resetTokenInvalid;
  if (context === 'register' && status === 409) return MESSAGES.emailTaken;

  return toErrorMessage(error);
}
