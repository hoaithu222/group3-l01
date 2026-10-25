import type { User, UserPrivacy } from "../../users/entities/user.interface";
import { permissionsForRole } from "../../../core/constants/permissions";
import { avatarUrlOf } from "../../../shared/media";

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: string;
  roles: string[];
  permissions: string[];
  status: string;
  emailVerified: boolean;
  /** Số điện thoại TỰ KHAI của chính người dùng (E.164, chưa xác minh); `null` = chưa khai. Chỉ trả cho CHÍNH họ. */
  phone: string | null;
  /** `null` = mặc định (chưa từng chỉnh) — app hiện `true` cho cả 2 công tắc khi `null`. */
  privacy: UserPrivacy | null;
  /**
   * `!= null` ⇔ tài khoản `PENDING_DELETION`. ⚠ Trong thực tế trường này gần như LUÔN `null` ở đây: `authenticateToken` chặn tài khoản
   * chờ xoá (`AUTH_012`) nên `GET /auth/me` không bao giờ trả về cho họ. Ngày tự ẩn danh hoá đến client qua `error.details.deletionGraceUntil`
   * của `403 AUTH_012` (đăng nhập mật khẩu/sinh trắc học đúng, refresh — xem `account-lock.ts`) và qua `POST /me/delete-request`. ISO string.
   */
  deletionGraceUntil: string | null;
}

/**
 * `extra`: quyền theo dữ liệu (recruiter:*, partner:*) — Phase 5; hiện luôn [].
 * `avatarUrl`: ghi đè tường minh (hiếm); mặc định `avatar` = URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (`avatarUrlOf`, chưa đặt ảnh → null) —
 * client dùng thẳng làm nguồn ảnh (`<img src>`/`expo-image`), KHÔNG ghép base URL, KHÔNG gửi Bearer; URL đổi khi đổi ảnh hoặc sang ngày mới.
 */
export function toAuthUserDto(
  user: User & { avatarAssetId?: string | null; status?: string; emailVerified?: boolean },
  extra: string[] = [],
  avatarUrl: string | null = null
): AuthUserDto {
  const role = user.role ?? "user";
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: avatarUrl ?? avatarUrlOf(user.avatarAssetId),
    role,
    roles: [role],
    permissions: [...new Set([...permissionsForRole(role), ...extra])],
    status: user.status ?? "ACTIVE",
    emailVerified: user.emailVerified ?? false,
    phone: user.phone ?? null,
    privacy: user.privacy ?? null,
    deletionGraceUntil: user.deletionGraceUntil ? user.deletionGraceUntil.toISOString() : null,
  };
}
