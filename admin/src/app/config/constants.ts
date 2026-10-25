/**
 * Hằng số cấp ứng dụng: tên app, đường route, cờ tính năng.
 *
 * Gom đường dẫn về một chỗ để không rải chuỗi ma khắp code và đổi route chỉ
 * phải sửa một nơi.
 */
export const APP_NAME = 'Super App Admin';

/** Đường route — dùng cho `<Link>`, redirect, breadcrumb. */
export const PATHS = {
  HOME: '/',

  // ── Khách (chưa đăng nhập) ────────────────────────────────────────────
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',

  // ── Đã đăng nhập ──────────────────────────────────────────────────────
  PROFILE: '/profile',
  SETTINGS: '/settings',
  /** Đích của link "Đổi mật khẩu" trong email cảnh báo đăng nhập thiết bị mới (`FRONTEND_URL/change-password`). */
  CHANGE_PASSWORD: '/change-password',
  /**
   * Đăng ký doanh nghiệp tuyển dụng (p6-08) — route độc lập NGOÀI registry, cần đăng nhập nhưng KHÔNG cần quyền quản trị (người đăng ký là tài khoản `user` thường,
   * chưa có quyền nào cho tới khi doanh nghiệp được tạo). Xem `routes.tsx` và `AuthGuard` (`allowNoAdminAccess`).
   */
  RECRUITER_SIGNUP: '/recruiter/signup',

  // ── Dự phòng ──────────────────────────────────────────────────────────
  NOT_FOUND: '/404',
  FORBIDDEN: '/403',
} as const;
