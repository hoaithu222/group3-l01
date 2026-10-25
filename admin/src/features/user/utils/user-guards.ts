import { CHANGE_ROLE_SELF_REASON, LOCK_BLOCKED_REASON } from '../constants/user.constants';
import type { AdminUser } from '../types/user.types';

type GuardTarget = Pick<AdminUser, 'id' | 'status'>;

/**
 * Vì sao KHÔNG khoá / mở khoá được `user` (`null` = được). Ẩn/khoá nút ngay ở client thay vì để quản
 * trị viên bấm rồi ăn 409/400 — BE chốt cùng các luật này (`UserService.assertLockToggleable`,
 * `lock` chặn tự khoá mình).
 *
 * `PENDING_DELETION`/`ANONYMIZED` có vòng đời riêng (D-02): khoá/mở khoá ghi đè `status` sẽ "hồi sinh"
 * tài khoản đã xoá hoặc chặn job ẩn danh hoá — huỷ xoá đi qua `POST /admin/users/:id/anonymize/cancel`.
 */
export function lockToggleBlockedReason(
  user: GuardTarget,
  currentUserId: string | undefined,
): string | null {
  if (user.status === 'PENDING_DELETION') return LOCK_BLOCKED_REASON.PENDING_DELETION;
  if (user.status === 'ANONYMIZED') return LOCK_BLOCKED_REASON.ANONYMIZED;
  // Chỉ nút "Khoá" có thể tự nhắm vào mình: tài khoản đang bị khoá thì không đăng nhập được để bấm "Mở khoá".
  if (user.status === 'ACTIVE' && user.id === currentUserId) return LOCK_BLOCKED_REASON.SELF;
  return null;
}

/** Vì sao KHÔNG đổi vai trò của `user` được (`null` = được) — BE trả 400 khi tự đổi vai trò của mình. */
export function changeRoleBlockedReason(
  user: Pick<AdminUser, 'id'>,
  currentUserId: string | undefined,
): string | null {
  return user.id === currentUserId ? CHANGE_ROLE_SELF_REASON : null;
}
