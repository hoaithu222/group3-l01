/**
 * Lọc dữ liệu nhạy cảm TRƯỚC KHI gửi sự kiện/breadcrumb lên Sentry (p0-11 app.md §4). Hàm THUẦN — không import SDK — nên test được không cần native module.
 *
 * Quy tắc:
 *  · `Authorization`/`Cookie` (header), `request.cookies`, `request.data` (body request/response) → che/bỏ.
 *  · Khoá nhạy cảm (`password`, `*token`, `refreshToken`, `secret`, `apiKey`, `nonce`, mã OTP/mời) và NỘI DUNG người dùng (`content`, `text`, `body`, `draft`) → `[Filtered]`.
 *  · URL: bỏ query/fragment; đoạn đường dẫn là MÃ BÍ MẬT (`/invite/<mã>`, `/invite/e/<token>`, `/live/<pin>`, `/m/<mã họp>`) → `[Filtered]`.
 *  · `user` chỉ giữ `id` (không email/SĐT/tên). Breadcrumb `console` bị bỏ (văn bản tự do — dấu vết log của app đi qua `logger` → breadcrumb `app`).
 */
export const FILTERED = '[Filtered]';

const SENSITIVE_KEY =
  /pass(word|wd)|secret|authori[sz]ation|api[-_]?key|cookie|credential|signature|token$|^token|^(otp|nonce|hmac|code|state|content|htmlcontent|text|body|draft|email|phone)$/i;
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-csrf-token)$/i;
/** Đoạn ngay sau các tiền tố này là mã bí mật/định danh ngắn hạn. */
const SECRET_PATH = /(\/(?:invite\/e|invite|live|m|reset-password|verify-email)\/)[^/?#]+/gi;
const MAX_DEPTH = 8;

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Sao chép đệ quy, thay giá trị chuỗi/đối tượng của khoá nhạy cảm bằng `[Filtered]`; số/boolean/null giữ nguyên. */
export function scrubValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > MAX_DEPTH) return '[Truncated]';
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((item) => scrubValue(item, depth + 1, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    const redactable = typeof child === 'string' || (typeof child === 'object' && child !== null);
    out[key] = SENSITIVE_KEY.test(key) && redactable ? FILTERED : scrubValue(child, depth + 1, seen);
  }
  return out;
}

/** Bỏ query + fragment và che đoạn đường dẫn là mã bí mật. Không bao giờ ném. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const path = cut < 0 ? url : url.slice(0, cut);
  return path.replace(SECRET_PATH, `$1${FILTERED}`);
}

export interface ScrubbableBreadcrumb {
  category?: string;
  data?: unknown;
  message?: string;
}

/** `beforeBreadcrumb`: `null` = bỏ (console); còn lại lọc URL và khoá nhạy cảm trong `data`, bỏ body. Không bao giờ ném. */
export function scrubBreadcrumb<T>(input: T): T | null {
  const breadcrumb = input as unknown as ScrubbableBreadcrumb;
  try {
    if (breadcrumb.category === 'console') return null;
    if (breadcrumb.data === undefined) return input;
    const clean = scrubValue(breadcrumb.data);
    if (isPlainObject(clean)) {
      for (const key of ['url', 'from', 'to'] as const) {
        const value = clean[key];
        if (typeof value === 'string') clean[key] = scrubUrl(value);
      }
      for (const key of ['request_body', 'response_body']) delete clean[key];
    }
    return { ...breadcrumb, data: clean } as unknown as T;
  } catch {
    return null;
  }
}

export interface ScrubbableEvent {
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  user?: { id?: unknown };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
}

/** `beforeSend`/`beforeSendTransaction`. Lỗi bất ngờ → trả sự kiện chỉ còn khung tối thiểu (không rò dữ liệu chưa lọc). */
export function scrubEvent<T>(input: T): T {
  const event = input as unknown as ScrubbableEvent;
  try {
    const request = event.request;
    if (request) {
      if (isPlainObject(request.headers)) {
        const headers: Json = {};
        for (const [key, value] of Object.entries(request.headers)) {
          headers[key] = SENSITIVE_HEADER.test(key) ? FILTERED : value;
        }
        request.headers = headers;
      }
      delete request.cookies;
      delete request.data;
      delete request.query_string;
      if (typeof request.url === 'string') request.url = scrubUrl(request.url);
    }
    if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {};
    if (event.extra !== undefined) event.extra = scrubValue(event.extra);
    if (event.contexts !== undefined) event.contexts = scrubValue(event.contexts);
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is ScrubbableBreadcrumb => b !== null);
    }
    return input;
  } catch {
    return { ...event, request: undefined, extra: undefined, contexts: undefined, breadcrumbs: undefined, user: undefined } as unknown as T;
  }
}
