/**
 * Hằng số của riêng ỨNG DỤNG này (khác với hằng số dùng chung ở `shared/`).
 */

/**
 * Đường dẫn màn hình.
 *
 * ── Vì sao vẫn cần bảng này khi đã có typed routes ───────────────────────────
 * `experiments.typedRoutes` đã bắt được lỗi gõ sai đường dẫn. Bảng này giải một
 * việc khác: cho phép ĐỔI đường dẫn ở một chỗ. Khi `/settings` tách thành
 * `/settings/general`, sửa đúng một dòng ở đây thay vì đi sửa từng lời gọi
 * `router.push` rải khắp app.
 *
 * ⛔ Khai một đường dẫn ở đây thì PHẢI có file route tương ứng trong `app/`.
 * Đây là cái bẫy đã dính một lần ở base web: `PATHS.PROFILE` được khai, menu
 * người dùng điều hướng tới, nhưng không route nào mount nó — bấm vào là ra
 * trang 404. TypeScript không thấy (chuỗi vẫn hợp lệ), lint cũng không.
 * `tests/project-structure.test.ts` đối chiếu hai danh sách để chặn ca đó.
 */
export const PATHS = {
  // Nhóm khách — `app/(auth)/`
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  /** p0-01 — huỷ yêu cầu xoá tài khoản (đăng nhập bị `AUTH_012`, hoặc vừa yêu cầu xoá). Nhóm khách: phiên đã bị BE thu hồi. */
  RESTORE_ACCOUNT: '/restore-account',

  // Nhóm đã đăng nhập — `app/(app)/`. `HOME` là màn TRANG CHỦ thật (`app/(app)/index.tsx`,
  // `features/home`) — nút giữa của thanh tab. Đăng nhập xong và "Về trang chủ" đều tới đây.
  HOME: '/',
  WORKSPACES: '/workspaces',
  WORKSPACES_NEW: '/workspaces/new',
  /**
   * Tham gia nhóm bằng link/mã mời (dán hoặc quét QR) — `features/members`. Cùng cấp `new`/`invitations`,
   * NGOÀI `[wsId]/` (người chưa vào nhóm không đọc được nhóm). `join` là điểm vào của cả hai; `scan` chỉ mở từ `join`.
   */
  WORKSPACES_JOIN: '/workspaces/join',
  WORKSPACES_SCAN: '/workspaces/scan',
  ACTIVITY: '/activity',
  STUDY: '/study',
  ME: '/me',
  ME_SETTINGS: '/me/settings',
  /** "Sửa hồ sơ" (tên hiển thị + SĐT tự khai) — mở từ tab Tôi. Route trong ngăn xếp `me/`. */
  ME_EDIT_PROFILE: '/me/edit-profile',
  ME_SESSIONS: '/me/sessions',
  ME_DELETE_ACCOUNT: '/me/delete-account',
  /** p0-01 — đổi mật khẩu (mở từ `me/settings`). */
  ME_CHANGE_PASSWORD: '/me/change-password',
  /** p1-09 — trang "Đã lưu" (tin đã lưu của tôi). Route nằm trong ngăn xếp `me/`, không phải tab riêng. */
  ME_SAVED: '/me/saved',
  /** p1-08 — "Người đã chặn" (danh sách + bỏ chặn). Route nằm trong ngăn xếp `me/`, mở từ `me/settings`. */
  ME_BLOCKED: '/me/blocked',
  /** p0-06 — "Thông báo" (quyền hệ thống, màn hình khoá, Không làm phiền). Route trong ngăn xếp `me/`, mở từ `me/settings`. */
  ME_NOTIFICATIONS: '/me/notifications',
  /** p0-06 — "Thiết bị nhận thông báo" (danh sách + gỡ). Mở từ `me/notifications`. */
  ME_DEVICES: '/me/devices',
  /** p2-04 — lịch họp (agenda) và tạo cuộc họp. Ngăn xếp `meetings/` ẩn khỏi thanh tab (`href: null`), mở từ hub nhóm / Tôi. */
  MEETINGS: '/meetings',
  MEETINGS_NEW: '/meetings/new',
} as const;

export type AppPath = (typeof PATHS)[keyof typeof PATHS];
