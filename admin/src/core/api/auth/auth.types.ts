/**
 * Kiểu dữ liệu request/response của Auth API.
 *
 * Mô hình quyền là RBAC PHẲNG: một người dùng có `roles` (nhãn) và
 * `permissions` (thứ thật sự được kiểm tra, dạng `"resource:action"`).
 * KHÔNG có khái niệm tổ chức / dự án / phòng ban ở base này — ứng dụng đơn
 * tenant. Cần đa tenant thì mở rộng ở dự án dẫn xuất, đừng nhét vào đây.
 */

// ─── Người dùng ──────────────────────────────────────────────────────────────

/** Một quyền: `{ resource: 'user', action: 'create' }`. */
export interface Permission {
  resource: string;
  action: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  /** Nhãn vai trò, ví dụ `['admin']`. Dùng để hiển thị và phân luồng thô. */
  roles: string[];
  /** Quyền đã làm phẳng dạng `"resource:action"` — nguồn để kiểm tra thật. */
  permissions: string[];
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface NonceResponse {
  nonce: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** Token dùng một lần nhận qua email. */
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  /** BE đòi ≥ 8 ký tự, có ít nhất một chữ cái và một chữ số. */
  newPassword: string;
}

// ─── Response ────────────────────────────────────────────────────────────────

/**
 * Trả về khi đổi mật khẩu thành công.
 *
 * BE nâng `sessionVersion` của tài khoản, nên access token client đang giữ thành token CŨ (401
 * `AUTH_004`). Phiên hiện tại được giữ lại và BE cấp luôn token mới trong `accessToken` — client
 * phải dùng nó ngay, không thì request kế tiếp đi một vòng 401 → refresh → phát lại. Thiếu
 * `accessToken` khi BE không xác định được phiên hiện tại (khi đó mọi phiên bị thu hồi).
 */
export interface ChangePasswordResponse {
  /** Số phiên KHÁC đã bị thu hồi. */
  revokedSessions: number;
  accessToken?: string;
  tokenType?: 'Bearer';
}

/**
 * Trả về khi login / register / refresh thành công.
 *
 * ⛔ KHÔNG có `refreshToken`: nó nằm trong cookie HttpOnly do BE set. Thêm
 * trường đó vào đây là kéo refresh token trở lại chỗ JavaScript đọc được —
 * đúng thứ mô hình cookie sinh ra để tránh.
 */
export interface LoginResponse {
  accessToken: string;
  user: User;
  /** Số giây còn hiệu lực của access token (nếu BE trả về). */
  expiresIn?: number;
}

export type RegisterResponse = LoginResponse;

/**
 * Refresh trả về CẢ hồ sơ người dùng, không chỉ token.
 *
 * Lý do: sau F5 bộ nhớ trống hoàn toàn (token cố ý không persist), nên lượt
 * refresh lúc khởi động là cơ hội duy nhất để dựng lại phiên. Nếu nó chỉ trả
 * token thì app phải gọi thêm `/auth/me` — thành hai vòng mạng chắn trước khung
 * hình đầu tiên, và người dùng nhìn màn trắng lâu gấp đôi.
 */
export type RefreshResponse = LoginResponse;
