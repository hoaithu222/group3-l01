/**
 * Lọc dữ liệu nhạy cảm TRƯỚC KHI gửi sự kiện/breadcrumb lên Sentry (p0-11 be.md §5.1, conventions §7.9 — không gửi token, nội dung tin, payload webhook).
 *
 * File này THUẦN (không import SDK, không I/O) để test được không cần Sentry và dùng chung cho `beforeSend`/`beforeSendTransaction`/`beforeBreadcrumb`.
 * Kiểu dữ liệu khai tối thiểu (cấu trúc) thay vì import kiểu của `@sentry/node`: SDK chỉ được nạp khi có DSN (xem `sentry.ts`).
 *
 * Quy tắc:
 *  · Header `authorization`/`cookie`/`set-cookie`/`x-api-key`… → `[Filtered]`; `request.cookies` bỏ hẳn.
 *  · Khoá có tên nhạy cảm (`password`, `*token`, `secret`, `apiKey`, `cookie`, `signature`, `otp`/`code`/`nonce`…) và NỘI DUNG người dùng (`content`, `htmlContent`, `text`, `body`,
 *    `description`) ở mọi đối tượng lồng nhau → `[Filtered]`.
 *  · Body request tới `/webhooks/*` bỏ hẳn (payload nhà cung cấp: tên, email người dùng tích hợp).
 *  · Query string: tham số nhạy cảm (`token`, `q` — từ khoá tìm kiếm là riêng tư…) → `[Filtered]`; URL trong breadcrumb/span cũng lọc query.
 *  · `user` chỉ giữ `id` (không email/IP/username).
 */
export const FILTERED = "[Filtered]";

/** Gần như trùng `redact.ts` của logger, MỞ RỘNG thêm nội dung người dùng + tham số OAuth/OTP. Khớp theo TÊN KHOÁ, không phân biệt hoa thường. */
const SENSITIVE_KEY =
  /pass(word|wd)|secret|authori[sz]ation|api[-_]?key|private[-_]?key|cookie|credential|signature|token$|^token|^(otp|nonce|hmac|code|state|content|htmlcontent|text|body|description|snippet)$/i;

/** Tham số query nhạy cảm (khớp chính xác, không phân biệt hoa thường). */
const SENSITIVE_QUERY = /^(token|access_token|refresh_token|id_token|code|state|nonce|otp|password|secret|signature|sig|key|apikey|q)$/i;

const MAX_DEPTH = 8;
const WEBHOOK_PATH = /\/webhooks?\//i;

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Sao chép đệ quy (không đụng vào đối tượng gốc) với giá trị của khoá nhạy cảm bị thay `[Filtered]`. Chỉ thay giá trị chuỗi/đối tượng/mảng — số, boolean, null giữ nguyên
 * (`code: 500`, `hasToken: true` không phải bí mật). Đối tượng không phải plain (Error, Date, Buffer) giữ nguyên.
 */
export function scrubValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((item) => scrubValue(item, depth + 1, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    const redactable = typeof child === "string" || (typeof child === "object" && child !== null);
    out[key] = SENSITIVE_KEY.test(key) && redactable ? FILTERED : scrubValue(child, depth + 1, seen);
  }
  return out;
}

/** `a=1&token=x` → `a=1&token=%5BFiltered%5D`. Xử lý theo từng cặp `k=v`, không cần chuỗi query hợp lệ tuyệt đối. */
export function scrubQueryString(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
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
    .join("&");
}

/** Lọc query trong URL đầy đủ hoặc chỉ đường dẫn; bỏ phần `#fragment`, giữ nguyên phần còn lại. */
export function scrubUrl(url: string): string {
  const hashAt = url.indexOf("#");
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const q = base.indexOf("?");
  if (q < 0) return base;
  return `${base.slice(0, q)}?${scrubQueryString(base.slice(q + 1))}`;
}

const SENSITIVE_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-hub-signature(-256)?|x-gitlab-token|x-goog-.*|x-csrf-token|x-forwarded-for|x-real-ip)$/i;

function scrubHeaders(headers: unknown): unknown {
  if (!isPlainObject(headers)) return headers;
  const out: Json = {};
  for (const [key, value] of Object.entries(headers)) out[key] = SENSITIVE_HEADER.test(key) ? FILTERED : value;
  return out;
}

export interface ScrubbableBreadcrumb {
  data?: unknown;
  message?: string;
  category?: string;
}

/** `beforeBreadcrumb`: bỏ body, lọc URL/query và khoá nhạy cảm trong `data`. Không bao giờ ném lỗi. */
export function scrubBreadcrumb<T>(input: T): T {
  const breadcrumb = input as unknown as ScrubbableBreadcrumb;
  try {
    if (breadcrumb.data === undefined) return input;
    const clean = scrubValue(breadcrumb.data);
    if (isPlainObject(clean)) {
      for (const key of ["body", "request_body", "response_body"]) delete clean[key];
      if (typeof clean.url === "string") clean.url = scrubUrl(clean.url);
      if (typeof clean.query === "string") clean.query = scrubQueryString(clean.query);
    }
    return { ...breadcrumb, data: clean } as unknown as T;
  } catch {
    return { ...breadcrumb, data: undefined } as unknown as T;
  }
}

/** Dữ liệu của span HTTP mang URL/query/header — lọc như request. */
function scrubSpanData(data: unknown): unknown {
  const clean = scrubValue(data);
  if (!isPlainObject(clean)) return clean;
  for (const [key, value] of Object.entries(clean)) {
    if (typeof value === "string" && /(^|\.)(url|target|query)$/i.test(key)) clean[key] = scrubUrl(value);
    if (/^http\.request\.header\./i.test(key)) clean[key] = FILTERED;
  }
  return clean;
}

export interface ScrubbableEvent {
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  user?: { id?: unknown };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
  spans?: Array<{ data?: unknown; description?: string }>;
}

/**
 * `beforeSend`/`beforeSendTransaction`: trả sự kiện đã lọc (sửa tại chỗ phần `request`; các phần khác tạo bản sao). Không bao giờ ném lỗi — một lỗi ở đây sẽ làm mất sự kiện,
 * nên bọc: hỏng thì trả sự kiện chỉ còn khung tối thiểu (KHÔNG rò dữ liệu chưa lọc).
 */
export function scrubEvent<T>(input: T): T {
  const event = input as unknown as ScrubbableEvent;
  try {
    const request = event.request;
    if (request) {
      if (request.headers !== undefined) request.headers = scrubHeaders(request.headers);
      delete request.cookies;
      const webhook = typeof request.url === "string" && WEBHOOK_PATH.test(request.url);
      if (typeof request.url === "string") request.url = scrubUrl(request.url);
      if (typeof request.query_string === "string") request.query_string = scrubQueryString(request.query_string);
      else if (request.query_string !== undefined) request.query_string = scrubValue(request.query_string);
      if (request.data !== undefined) request.data = webhook ? FILTERED : scrubValue(request.data);
    }
    if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {};
    if (event.extra !== undefined) event.extra = scrubValue(event.extra);
    if (event.contexts !== undefined) event.contexts = scrubValue(event.contexts);
    if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b));
    if (event.spans) {
      event.spans = event.spans.map((s) => ({
        ...s,
        ...(s.data !== undefined && { data: scrubSpanData(s.data) }),
        ...(typeof s.description === "string" && { description: scrubUrl(s.description) }),
      }));
    }
    return input;
  } catch {
    return { ...event, request: undefined, extra: undefined, contexts: undefined, breadcrumbs: undefined, spans: undefined, user: undefined } as unknown as T;
  }
}
