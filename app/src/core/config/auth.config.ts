/**
 * Hằng số xác thực — email/mật khẩu + JWT.
 *
 * ── Mô hình phiên trên DI ĐỘNG (khác web, đọc kỹ) ────────────────────────────
 *
 * Bên web, refresh token nằm trong cookie `HttpOnly` do backend đặt: JavaScript
 * không bao giờ nhìn thấy nó. Trên di động KHÔNG có cơ chế đó — không có trình
 * duyệt nào giữ cookie hộ, và cookie trong WebView thì app tự đọc được nên
 * chẳng còn là `HttpOnly` theo nghĩa bảo vệ nữa.
 *
 * Nên trên di động, chỗ trú an toàn tương đương là **kho khoá của hệ điều hành**:
 *
 *   | Thứ            | Chỗ để                        | Vì sao                                   |
 *   |----------------|-------------------------------|------------------------------------------|
 *   | Access token   | Bộ nhớ (zustand, KHÔNG persist) | Sống ngắn; tắt app là mất, đúng ý muốn |
 *   | Refresh token  | `expo-secure-store`           | Keychain (iOS) / Keystore (Android) — mã hoá bởi OS, ràng vào app |
 *   | Hồ sơ người dùng | `AsyncStorage`              | Không nhạy cảm; cần đọc nhanh để vẽ khung màn hình đầu |
 *
 * ⛔ **KHÔNG để refresh token trong `AsyncStorage`.** AsyncStorage trên Android
 * là một file SQLite thường trong thư mục app, KHÔNG mã hoá. Trên máy đã root
 * (rất phổ biến ở công trường / máy dùng chung), hoặc qua một bản sao lưu ADB,
 * nó là văn bản trần. Refresh token đọc được = chiếm phiên vô thời hạn.
 * Đây đúng là chỗ dự án tham chiếu `vci-sun-mobile` làm sai, xem README §"Khác gì".
 */

/** Khoá của refresh token trong kho khoá hệ điều hành. */
export const REFRESH_TOKEN_KEY = 'auth.refresh-token';

/**
 * Khoá `AsyncStorage` cho phần phiên ĐƯỢC PHÉP lưu thường (hồ sơ người dùng).
 * Access token và refresh token KHÔNG nằm trong đây — xem bảng ở đầu file.
 */
export const AUTH_STORAGE_KEY = 'auth-storage';

/** Đường refresh — nối sau `appConfig.apiBaseUrl`. */
export const AUTH_REFRESH_PATH = '/auth/refresh';

/**
 * Coi token là "sắp hết hạn" khi còn dưới ngần này (ms).
 * 60 giây đủ bù lệch đồng hồ máy/máy chủ cộng độ trễ mạng di động.
 */
export const TOKEN_EXPIRY_LEEWAY_MS = 60_000;

/**
 * Quá hạn này coi như máy chủ không trả lời lời gọi refresh.
 *
 * BẮT BUỘC có: nếu bộ cân tải nhận kết nối rồi im (đang deploy dở), không có
 * timeout thì mọi request đang xếp hàng sau refresh treo tới lúc socket chết —
 * mà trên di động, socket chết có thể mất vài phút.
 */
export const REFRESH_TIMEOUT_MS = 15_000;
