/**
 * Lọc dữ liệu nhạy cảm TRƯỚC KHI gửi sự kiện/breadcrumb lên Sentry (p0-11 admin.md §3). Hàm THUẦN — không import SDK — nên test được không cần Sentry.
 *
 * Quy tắc riêng của trang quản trị:
 *  · `Authorization`/`Cookie` (header) và `request.cookies` → bỏ/che.
 *  · `reason` (lý do thao tác quản trị) và nội dung tự do (`content`, `description`, `note`) → che: có thể chứa tên/email người dùng; chỉ giữ MÃ hành động.
 *  · `email`, `phone`, `password`, `*token`, `secret` → che. `user` chỉ giữ `id`.
 *  · URL (trang hiện tại, breadcrumb điều hướng/fetch): tham số nhạy cảm (`token`, `code`, `q`…) → `[Filtered]` (link đặt lại mật khẩu mang `?token=`).
 *  · Breadcrumb `console` bị bỏ hẳn (văn bản tự do, có thể mang dữ liệu người dùng).
 */
export const FILTERED = '[Filtered]';

const SENSITIVE_KEY =
  /pass(word|wd)|secret|authori[sz]ation|api[-_]?key|cookie|credential|signature|token$|^token|^(otp|nonce|reason|note|content|htmlcontent|description|email|phone|code|state|body)$/i;
const SENSITIVE_QUERY =
  /^(token|access_token|refresh_token|id_token|code|state|nonce|otp|password|secret|signature|sig|key|apikey|q)$/i;
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-csrf-token)$/i;
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

export function scrubQueryString(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const key = pair.slice(0, eq);
      let decoded = key;
      try {
        decoded = decodeURIComponent(key);
      } catch {
        // khoá không giải mã được — dùng nguyên văn
      }
      return SENSITIVE_QUERY.test(decoded) ? `${key}=${encodeURIComponent(FILTERED)}` : pair;
    })
    .join('&');
}

/** Lọc query của URL; bỏ `#fragment` (SPA có thể đặt token ở đó). */
export function scrubUrl(url: string): string {
  const hashAt = url.indexOf('#');
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const q = base.indexOf('?');
  return q < 0 ? base : `${base.slice(0, q)}?${scrubQueryString(base.slice(q + 1))}`;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  data?: unknown;
  message?: string;
}

/** `beforeBreadcrumb`: `null` = bỏ breadcrumb (console); còn lại lọc URL/query/khoá nhạy cảm trong `data`. Không bao giờ ném. */
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
      if (typeof request.url === 'string') request.url = scrubUrl(request.url);
      if (typeof request.query_string === 'string') request.query_string = scrubQueryString(request.query_string);
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
