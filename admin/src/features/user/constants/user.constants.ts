import type { UserRole, UserStatus } from '../types/user.types';

/** Nhãn vai trò hệ thống — dùng cho filter dropdown và `SelectField` đổi vai trò. */
export const USER_ROLE_OPTIONS: ReadonlyArray<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'user', label: 'Người dùng' },
];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  user: 'Người dùng',
};

/**
 * Vì sao KHÔNG khoá / mở khoá được tài khoản — khớp `UserService.lock/unlock` phía BE
 * (`assertLockToggleable` → 409, tự khoá mình → 400). Một nguồn để chú thích trên giao diện, câu báo
 * lỗi và bài kiểm nói CÙNG một câu.
 */
export const LOCK_BLOCKED_REASON = {
  PENDING_DELETION:
    'Tài khoản đang chờ xoá nên không thể khoá hay mở khoá — hãy huỷ yêu cầu xoá trước.',
  ANONYMIZED: 'Tài khoản đã ẩn danh hoá nên không thể khoá hay mở khoá.',
  SELF: 'Bạn không thể tự khoá tài khoản của chính mình.',
} as const;

/** `PATCH /users/:id/role` trả 400 khi đối tượng là chính người thao tác. */
export const CHANGE_ROLE_SELF_REASON = 'Bạn không thể đổi vai trò của chính mình.';

/** Nhãn trạng thái tài khoản — dùng cho filter dropdown. */
export const USER_STATUS_OPTIONS: ReadonlyArray<{ value: UserStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'LOCKED', label: 'Đã khoá' },
  { value: 'PENDING_DELETION', label: 'Chờ xoá' },
  { value: 'ANONYMIZED', label: 'Đã ẩn danh' },
];
