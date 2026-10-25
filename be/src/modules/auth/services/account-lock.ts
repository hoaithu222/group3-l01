import type { User } from "../../users/entities/user.interface";
import { AccountLockedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";

/**
 * `error.details` của `AUTH_012` (tài khoản đang chờ xoá): ngày tự ẩn danh hoá — để màn "Khôi phục tài khoản" của client biết ngày ngay
 * cả khi yêu cầu xoá được thực hiện ở máy khác (không có sẵn trong bộ nhớ máy đang đăng nhập). Chỉ trả cho người đã chứng minh sở hữu
 * (mật khẩu/HMAC sinh trắc đúng hoặc refresh token hợp lệ) — các luồng đó mới gọi hàm này.
 */
export function pendingDeletionDetails(user: Pick<User, "deletionGraceUntil"> | null | undefined): {
  deletionGraceUntil: string | null;
} {
  return { deletionGraceUntil: user?.deletionGraceUntil ? user.deletionGraceUntil.toISOString() : null };
}

/** Lỗi ứng với trạng thái không cho đăng nhập: chờ xoá ⇒ `AUTH_012` (kèm ngày), khoá/ẩn danh ⇒ `AUTH_011`. */
export function accountBlockedError(user: Pick<User, "status" | "deletionGraceUntil">): AccountLockedError {
  return user.status === "PENDING_DELETION"
    ? new AccountLockedError(ErrorCode.AUTH_012, pendingDeletionDetails(user))
    : new AccountLockedError(ErrorCode.AUTH_011);
}
