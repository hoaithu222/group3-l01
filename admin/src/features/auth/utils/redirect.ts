/**
 * Chống mở redirect (open redirect) cho đích quay lại sau đăng nhập.
 *
 * `from` do `AuthGuard` ghi vào `location.state` — thứ chỉ mã của CHÍNH app này ghi
 * được — nhưng nơi đọc (`LoginPage`, `GuestGuard`) không nên tin nó: `state` có thể còn
 * sót từ phiên duyệt cũ, và một ngày nào đó ai đó sẽ thêm `?from=` lên URL. Hàm này là
 * cổng DUY NHẤT: chỉ nhận đường dẫn NỘI BỘ của app, mọi thứ khác về trang chủ.
 */
import { PATHS } from '@/app/config';

const MAX_LENGTH = 2048;

/**
 * Trang khách và trang lỗi — "quay lại" đó sau khi đăng nhập là vòng lặp (login →
 * login) hoặc vô nghĩa. `/reset-password` còn mang token trong query: không ghi lại.
 */
const NOT_RETURNABLE = new Set<string>([
  PATHS.LOGIN,
  PATHS.REGISTER,
  PATHS.FORGOT_PASSWORD,
  PATHS.RESET_PASSWORD,
  PATHS.FORBIDDEN,
  PATHS.NOT_FOUND,
]);

/** Origin giả để `new URL` phân tích đường tương đối — nếu phân tích ra origin khác là đường dẫn "trốn" ra ngoài. */
const INTERNAL_ORIGIN = 'http://internal.invalid';

/**
 * Ký tự điều khiển. Trình duyệt BỎ tab/xuống dòng khi phân tích URL nên `/\t/evil.com` trở
 * thành `//evil.com`. Duyệt từng ký tự thay vì regex `[\x00-\x1f]` (ESLint `no-control-regex`).
 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Trả đường dẫn nội bộ an toàn (`/path?query#hash`) hoặc `fallback`.
 * Chỉ nhận chuỗi bắt đầu bằng ĐÚNG MỘT dấu `/`; loại `//host` (protocol-relative),
 * `\`, `https://…`, `javascript:…`, ký tự điều khiển và các trang khách.
 */
export function sanitizeRedirectPath(raw: unknown, fallback: string = PATHS.HOME): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (value === '' || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || hasControlChar(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_ORIGIN) return fallback;
  if (NOT_RETURNABLE.has(url.pathname)) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
