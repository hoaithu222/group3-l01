/**
 * Kiểu dữ liệu phiên đăng nhập — JWT, ĐƠN TENANT.
 *
 * Cố ý KHÔNG có organization / project / department: base này chạy RBAC phẳng.
 * Dự án nào cần nhiều tổ chức thì thêm ở tầng feature, đừng nhét ngược vào đây —
 * mọi màn hình sẽ phải biết về một khái niệm mà đa số chúng không dùng.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  /**
   * Email đã xác minh chưa (`AuthUserDto.emailVerified` của BE). `undefined` = hồ sơ persist từ bản cũ chưa có trường này —
   * ⛔ đừng coi là "chưa xác minh": chỉ `=== false` mới là chắc chắn chưa (`EmailVerifyRow`).
   */
  emailVerified?: boolean;
  /** SĐT TỰ KHAI của chính mình, E.164 (`+84912345678`), CHƯA xác minh; `null` = chưa khai (`AuthUserDto.phone`). */
  phone?: string | null;
  /** Vai trò — dùng cho gate thô. Vd `['admin']`. */
  roles: string[];
  /**
   * Quyền chi tiết, mã hoá dạng `"resource:action"` (vd `"user:create"`).
   * Dùng chuỗi thay vì object để so khớp bằng `includes` và dễ serialize.
   */
  permissions: string[];
  /**
   * Quyền riêng tư (p0-01 mục 10) — `undefined`/`null` = mặc định CẢ HAI `true`.
   *
   * ⚠️ Hình dạng khai LẠI ở đây (trùng `PrivacySettings` của
   * `core/api/auth/auth.types.ts`) thay vì import: `auth.types.ts` đã import
   * NGƯỢC `AuthUser` từ chính file này (chuẩn hoá phản hồi backend), nên import
   * chiều kia sẽ tạo VÒNG NHẬP giữa hai file — `import/no-cycle` chặn cứng.
   */
  privacy?: {
    readReceipts: boolean;
    showPresence: boolean;
    showInLeaderboard?: boolean;
    showGamification?: boolean;
  } | null;
  /** Khác `null`/`undefined` ⇒ tài khoản ĐANG chờ xoá (ân hạn) — chuỗi ISO. */
  deletionGraceUntil?: string | null;
}

/**
 * Trạng thái phiên — phân biệt "chưa biết" với "chắc chắn chưa đăng nhập".
 *
 * Gộp hai thứ này làm một boolean là bug kinh điển của app di động: ở khung hình
 * đầu chưa ai biết có phiên hay không (`AsyncStorage` còn đang đọc), mà boolean
 * thì bắt buộc phải là `false` — nên guard đá người dùng ra màn đăng nhập rồi
 * một nhịp sau mới kéo về. Người dùng thấy màn đăng nhập nhấp nháy mỗi lần mở app.
 */
export type AuthStatus =
  /** Chưa thử khôi phục phiên lần nào (khung hình đầu sau khi mở app). */
  | 'idle'
  /** Đang gọi refresh để khôi phục phiên. */
  | 'restoring'
  /** Có token hợp lệ. */
  | 'authenticated'
  /** Đã thử và xác nhận không có phiên. */
  | 'anonymous';

export interface AuthState {
  user: AuthUser | null;

  /**
   * Access token — CHỈ NẰM TRONG BỘ NHỚ, cố ý KHÔNG persist.
   *
   * Tắt app là mất, và được dựng lại bằng một lượt refresh lúc khởi động
   * (refresh token lấy từ kho khoá hệ điều hành — xem `core/api/session.ts`).
   * Đó là điểm mấu chốt: kẻ đọc được `AsyncStorage` cũng không có gì để dùng.
   */
  token: string | null;

  status: AuthStatus;

  /**
   * `AsyncStorage` đã nạp xong chưa.
   *
   * ⛔ Điều hướng KHÔNG được quyết định trước khi cờ này bật — xem chú thích
   * "BẤT ĐỒNG BỘ" ở `core/storage/app-storage.ts`.
   */
  hasHydrated: boolean;
}

export interface AuthActions {
  /** Ghi phần nào truyền vào; phần không truyền GIỮ NGUYÊN. */
  setAuth: (payload: { user?: AuthUser | null; token?: string | null }) => void;
  setStatus: (status: AuthStatus) => void;
  setHasHydrated: (value: boolean) => void;
  /** Xoá phiên trong bộ nhớ. ⛔ KHÔNG xoá refresh token — xem `session.purgeSession()`. */
  clearAuth: () => void;
  /** Có token và token chưa hết hạn (đọc `exp` trong JWT). */
  isAuthenticated: () => boolean;
  /** Khớp `"resource:action"`. Người có vai trò `admin` luôn trả `true`. */
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (role: string) => boolean;
}

export type AuthStore = AuthState & AuthActions;
