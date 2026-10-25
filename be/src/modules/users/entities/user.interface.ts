import type { RoleCode } from "../../../core/constants";

/** `User.privacy` (p0-01 D-23) — embedded, `set` toàn bộ object khi cập nhật. */
export interface UserPrivacy {
  readReceipts: boolean;
  showPresence: boolean;
  /** p4-03 (đồng bộ chéo #6) — hiện trong bảng xếp hạng nhóm. Vắng/`null` (tài liệu cũ) ≡ `true`. */
  showInLeaderboard?: boolean | null;
  /** p4-03 — hồ sơ công khai (cấp độ, chuỗi, huy hiệu trưng bày) cho người chung nhóm. Vắng/`null` ≡ `true`. */
  showGamification?: boolean | null;
  /** Cho người khác tìm thấy bằng email đầy đủ (thêm thành viên/tìm người). Vắng/`null` (tài liệu cũ) ≡ `true`. */
  findableByEmail?: boolean | null;
  /** Như trên, bằng số điện thoại. Vắng/`null` ≡ `true`. */
  findableByPhone?: boolean | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  /** Số điện thoại tự khai, E.164 (`+84912345678`) — chưa xác minh; `null`/vắng = chưa khai. */
  phone?: string | null;
  role?: RoleCode;
  passwordHash?: string;
  status?: string;
  emailVerified?: boolean;
  sessionVersion?: number;
  avatarAssetId?: string | null;
  privacy?: UserPrivacy | null;
  /** `!= null` ⇒ tài khoản đang `PENDING_DELETION`, tự xoá sau mốc này (p0-01 §5.4). */
  deletionGraceUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  email: string;
  name: string;
  /** Đã chuẩn hoá E.164 bởi `normalizePhone` (DTO/service) — repository ghi nguyên văn. */
  phone?: string | null;
  role?: RoleCode;
  password?: string;
  passwordHash?: string;
  /** `true` chỉ khi email đã được nhà cung cấp danh tính (Google…) xác minh; mặc định `false`. */
  emailVerified?: boolean;
}

export interface UserUpdateInput {
  email?: string;
  name?: string;
  /** E.164 đã chuẩn hoá; `null` = xoá số. */
  phone?: string | null;
  role?: RoleCode;
  password?: string;
  /** Chỉ dùng để XÁC NHẬN khi tự đổi mật khẩu/email của chính mình (`UserService.update`) — không bao giờ ghi xuống repository. */
  currentPassword?: string;
  passwordHash?: string;
  avatarAssetId?: string | null;
  privacy?: UserPrivacy | null;
  /** Đổi email ⇒ đặt `false` (email mới chưa được xác minh). */
  emailVerified?: boolean;
}
