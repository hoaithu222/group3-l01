/**
 * Kiểu dữ liệu phiên đăng nhập — JWT, ĐƠN TENANT.
 *
 * Cố ý KHÔNG có organization / project / department: base này chạy RBAC phẳng.
 * Dự án nào cần nhiều tổ chức thì thêm ở tầng feature, đừng nhét ngược vào đây.
 */

/** Quyền dạng phẳng: `{tài nguyên, hành động}`. Vd `{ resource: 'user', action: 'create' }`. */
export interface Permission {
  resource: string;
  action: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  /** Vai trò — dùng cho gate thô. Vd `['admin']`. */
  roles: string[];
  /**
   * Quyền chi tiết, mã hoá dạng `"resource:action"` (vd `"user:create"`).
   * Dùng chuỗi thay vì object để so khớp bằng Set — nhanh và dễ serialize.
   */
  permissions: string[];
}

/** Trạng thái phiên — phân biệt "chưa biết" với "chắc chắn chưa đăng nhập". */
export type AuthStatus =
  /** Chưa thử khôi phục phiên lần nào (khung hình đầu sau F5). */
  | 'idle'
  /** Đang gọi refresh để khôi phục phiên. */
  | 'restoring'
  /** Có token hợp lệ. */
  | 'authenticated'
  /** Đã thử và xác nhận không có phiên. */
  | 'anonymous'
  /**
   * Không hỏi được máy chủ (mất mạng / 5xx) lúc khôi phục phiên, trong khi trình
   * duyệt CÓ dấu hiệu từng đăng nhập. Chưa biết phiên còn hay chết — KHÔNG đá ra
   * trang đăng nhập; hiện màn "thử lại" và giữ hồ sơ.
   */
  | 'unavailable';

/**
 * Vì sao phiên kết thúc — để trang đăng nhập nói đúng một câu. `null` = người
 * dùng chủ động thoát (hoặc chưa từng có phiên): không cần lời nhắn nào.
 */
export type SessionEndReason =
  /** Refresh token hết hạn / không còn (cookie mất, quá 7 ngày, đăng nhập ở nơi khác). */
  | 'expired'
  /** Phiên bị thu hồi phía máy chủ (nghi ngờ rò rỉ token, đổi mật khẩu, tài khoản khác chiếm cookie). */
  | 'revoked'
  /** Tài khoản bị khoá / đang chờ xoá. */
  | 'locked';

export interface AuthState {
  user: AuthUser | null;
  /**
   * Access token — CHỈ NẰM TRONG BỘ NHỚ, cố ý KHÔNG persist.
   *
   * Refresh token nằm ở cookie HttpOnly do BE đặt, JS không đọc được. Sau F5
   * token này mất và được khôi phục bằng một lượt gọi refresh lúc khởi động
   * (xem `AuthGuard`). Đây là lý do `partialize` bên dưới loại nó ra —
   * để token trong localStorage là mở cửa cho XSS đọc mất phiên.
   */
  token: string | null;
  status: AuthStatus;
  /** Lý do phiên vừa kết thúc, để `LoginPage` hiện lời nhắn. Không persist. */
  endReason: SessionEndReason | null;
}

export interface AuthActions {
  setAuth: (payload: { user?: AuthUser | null; token?: string | null }) => void;
  setStatus: (status: AuthStatus) => void;
  /** Xoá sạch phiên phía client và ghi lại vì sao (`null` = người dùng tự thoát). */
  clearAuth: (reason?: SessionEndReason | null) => void;
  /** Ẩn lời nhắn "phiên đã kết thúc" sau khi người dùng đã thấy nó. */
  dismissEndReason: () => void;
  /** Có token và token chưa hết hạn (đọc `exp` trong JWT). */
  isAuthenticated: () => boolean;
  /** Khớp `"resource:action"`. Người có vai trò `admin` luôn trả true. */
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (role: string) => boolean;
}

export type AuthStoreType = AuthState & AuthActions;
