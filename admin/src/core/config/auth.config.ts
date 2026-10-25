/**
 * Hằng số xác thực — email/password + JWT.
 *
 * Mô hình phiên:
 *  - **Access token** là JWT ngắn hạn, sống TRONG BỘ NHỚ (auth store, không
 *    persist). Để trong `localStorage` thì XSS đọc được và mang đi dùng.
 *  - **Refresh token** nằm trong cookie `HttpOnly` do BE set khi login. JS
 *    không bao giờ nhìn thấy nó; trình duyệt tự đính kèm nhờ
 *    `withCredentials: true`. Vì vậy FE không có khoá nào lưu refresh token.
 *
 * Ở đây CHỈ có hằng số. Logic gọi refresh nằm ở `@/core/api/session`; việc đá
 * người dùng về trang đăng nhập khi phiên chết là của `AuthGuard` (đọc `status`
 * của auth store) — KHÔNG điều hướng cứng (`window.location`) từ tầng HTTP.
 */

/** Đường refresh — nối sau `appConfig.apiBaseUrl`. Cookie HttpOnly tự đi kèm. */
export const AUTH_REFRESH_PATH = '/auth/refresh';

/**
 * Endpoint mà 401 KHÔNG có nghĩa "access token hết hạn" — interceptor KHÔNG được
 * làm mới token rồi phát lại request ở đây.
 *
 * Sai mật khẩu (`login`), token đặt lại mật khẩu sai (`reset-password`), mật khẩu
 * hiện tại sai (`change-password`) đều là 401 của BE, và BE còn dùng CÙNG mã
 * `AUTH_002` với "token không hợp lệ", nên chỉ đường dẫn mới phân biệt được.
 * Bỏ sót ở đây là lỗi kinh điển: sai mật khẩu → interceptor tưởng phiên hết hạn →
 * gọi refresh (chưa có cookie → 401) → đá về `/login` giữa lúc người dùng đang
 * đọc thông báo lỗi.
 *
 * So khớp bằng `endsWith` trên đường dẫn đã bỏ query — `config.url` của axios là
 * đường TƯƠNG ĐỐI (chưa nối `baseURL`).
 */
export const AUTH_NO_REFRESH_PATHS = [
  '/auth/nonce',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/change-password',
] as const;

/**
 * Tên khoá Web Locks bọc lượt refresh — MỌI tab cùng origin xếp hàng qua đây.
 *
 * Single-flight trong `session.ts` chỉ chặn được trùng lặp TRONG MỘT tab. Hai tab
 * cùng hết hạn token một lúc sẽ gọi refresh song song với CÙNG cookie: lượt sau bị
 * BE coi là dùng lại token đã xoay vòng (phiên bị cắt, hoặc — trong cửa sổ tha thứ
 * 30 s — cookie bị ghi đè bằng token BE không lưu, chết ở lượt refresh kế tiếp).
 */
export const REFRESH_LOCK_NAME = 'super-app-admin:auth-refresh';

/** Kênh đồng bộ đăng xuất/đăng nhập giữa các tab (xem `useMultiTabSync`). */
export const AUTH_SYNC_CHANNEL = 'auth';

/**
 * Khoá localStorage cho phần phiên ĐƯỢC PHÉP lưu (hồ sơ người dùng, tuỳ chọn
 * giao diện). Access token KHÔNG nằm trong đây — xem chú thích đầu file.
 */
export const AUTH_STORAGE_KEY = 'auth-storage';

/**
 * Coi token là "sắp hết hạn" khi còn dưới ngần này (ms). Dùng để refresh CHỦ
 * ĐỘNG trước khi gửi request nhạy cảm (đổi mật khẩu — xem `ensureFreshAccessToken`),
 * thay vì đợi ăn 401 rồi mới chữa.
 * 60 giây đủ để bù lệch đồng hồ client/server và độ trễ mạng.
 */
export const TOKEN_EXPIRY_LEEWAY_MS = 60_000;

/**
 * Quá hạn này coi như máy chủ không trả lời cho lời gọi refresh.
 * BẮT BUỘC có: nếu LB nhận kết nối rồi im (deploy dở), không có timeout thì
 * mọi request đang xếp hàng sau refresh treo tới lúc socket chết.
 */
export const REFRESH_TIMEOUT_MS = 10_000;

/** Tắt được khi BE chưa có endpoint refresh — lúc đó 401 là đăng xuất luôn. */
export const ENABLE_REFRESH_TOKEN = true;
