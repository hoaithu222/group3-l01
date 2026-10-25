/**
 * Đổi lỗi của thao tác quản trị người dùng thành MỘT câu tiếng Việt cho người thao tác.
 *
 * Tại sao không để interceptor (`core/api/client.ts`) toast? `getErrorMessage` tra theo MÃ lỗi trước,
 * mà BE dùng mã CHUNG cho các từ chối nghiệp vụ ở đây:
 *  - 409 → `RES_002` ("Tài nguyên đã tồn tại") cho cả "khoá tài khoản đang chờ xoá" lẫn "email đã dùng";
 *  - 400 → `VAL_001` ("Dữ liệu đầu vào không hợp lệ") cho cả "tự khoá mình" lẫn "tự đổi vai trò của mình".
 * Người quản trị đọc xong không biết mình sai ở đâu. Nghĩa của 400/409 phụ thuộc thao tác đang gọi nên
 * chỉ nơi gọi biết — cùng lý do `features/auth` có `resolveAuthError`. Service dùng `skipErrorToast` và
 * hook toast câu trả về ở đây.
 *
 * Lỗi không thuộc các ca đặc thù rơi về ĐÚNG câu mà interceptor sẽ hiện (`getErrorMessage`) — không đổi
 * hành vi của 403/404/429/5xx/mất mạng.
 */
import { isAxiosError, type AxiosError } from 'axios';

import { getErrorMessage } from '@/core/api/client.helpers';
import { extractErrorCode, extractErrorDetails } from '@/core/api/error.handler';

import { CHANGE_ROLE_SELF_REASON, LOCK_BLOCKED_REASON } from '../constants/user.constants';

export type UserAction = 'create' | 'lock' | 'unlock' | 'change-role';

/** `POST /users` → 409: BE `ConflictError("Email đã tồn tại")` (đã chuẩn hoá email nên khác hoa/thường vẫn trùng). */
export const EMAIL_TAKEN_MESSAGE = 'Email này đã được sử dụng bởi một tài khoản khác.';

const LOCK_CONFLICT_MESSAGE =
  'Không thể khoá hay mở khoá tài khoản đang chờ xoá hoặc đã ẩn danh hoá. Hãy huỷ yêu cầu xoá trước rồi thử lại.';

/** Mã báo tài khoản CỦA CHÍNH NGƯỜI THAO TÁC vừa bị khoá/chờ xoá — interceptor đã đăng xuất, trang đăng nhập nói lý do. */
const SESSION_ENDED_CODES: ReadonlySet<string> = new Set(['AUTH_011', 'AUTH_012']);

export const isConflictError = (error: unknown): boolean =>
  isAxiosError(error) && error.response?.status === 409;

/**
 * `true` khi BE báo lỗi TRƯỜNG cụ thể (Zod `details`) — KHÁC với 400 do luật nghiệp vụ trong service
 * (tự khoá / tự đổi vai trò), vốn không kèm `details` (BE chỉ gắn `details` khi không rỗng).
 */
function hasFieldDetails(error: AxiosError): boolean {
  const details = extractErrorDetails(error);
  if (details === null || typeof details !== 'object') return false;
  return Array.isArray(details) ? details.length > 0 : Object.keys(details).length > 0;
}

/**
 * Câu lỗi cho một thao tác trên người dùng; `null` = đừng toast (phiên của chính người thao tác đã chết,
 * trang đăng nhập sẽ nói rõ). Luôn trả chuỗi hoặc `null`, không ném.
 */
export function resolveUserActionError(error: unknown, action: UserAction): string | null {
  if (!isAxiosError(error)) return 'Không thực hiện được. Vui lòng thử lại.';
  if (SESSION_ENDED_CODES.has(extractErrorCode(error))) return null;

  const status = error.response?.status;
  if (status === 409) {
    if (action === 'create') return EMAIL_TAKEN_MESSAGE;
    if (action === 'lock' || action === 'unlock') return LOCK_CONFLICT_MESSAGE;
  }
  if (status === 400 && !hasFieldDetails(error)) {
    if (action === 'lock') return LOCK_BLOCKED_REASON.SELF;
    if (action === 'change-role') return CHANGE_ROLE_SELF_REASON;
  }

  return getErrorMessage(
    status,
    error.response?.data as Record<string, unknown> | undefined,
    error.message || 'Đã xảy ra lỗi không xác định',
  );
}
