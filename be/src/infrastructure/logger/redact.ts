import winston from "winston";

/**
 * Chốt chặn che dữ liệu nhạy cảm ở LOGGER (p0-01 be.md §12, p0-13 BIO-20): giá trị của khoá có tên nhạy cảm trong meta (đệ quy) bị thay bằng `[REDACTED]`
 * TRƯỚC khi tới bất kỳ transport nào (file, console, Sentry qua transport khác) — dù call-site có lỡ log `{ password }`/`{ refreshToken }`/`{ secretHash }`.
 *
 * Khớp theo TÊN KHOÁ, không phân biệt hoa thường: chứa `password`/`passwd`/`secret` (kể cả `secretHash`, `clientSecret`), `authorization`, `apiKey`,
 * `privateKey`, `cookie`, `credential`; hoặc KẾT THÚC bằng `token` (`token`, `refreshToken`, `accessToken`, `deviceToken`, `fcmToken`, `verificationToken`).
 * Cố ý KHÔNG bắt `tokens`/`tokenCount`/`tokenTtlSeconds` (số đếm/cấu hình, hữu ích khi gỡ lỗi). Chỉ che giá trị chuỗi/đối tượng/mảng — boolean, số, null giữ nguyên
 * (`passwordChanged: true`, `passwordAttempts: 3` không phải bí mật). Không che nội dung câu `message` (call-site không được nội suy bí mật vào chuỗi).
 */
export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY = /password|passwd|secret|authorization|api[-_]?key|private[-_]?key|cookie|credential|token$/i;
/** Chặn đệ quy bất thường (meta lồng sâu/vòng tham chiếu) — không phải giới hạn nghiệp vụ. */
const MAX_DEPTH = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Sao chép đệ quy (không đụng vào đối tượng của caller) với giá trị khoá nhạy cảm đã che. Đối tượng không phải plain (Error, Date, Buffer…) giữ nguyên. */
export function redactValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return value.map((item) => redactValue(item, depth + 1, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const sensitive = SENSITIVE_KEY.test(key) && child !== null && (typeof child === "string" || typeof child === "object");
    out[key] = sensitive ? REDACTED : redactValue(child, depth + 1, seen);
  }
  return out;
}

/** Winston format — gắn TRƯỚC `json()`; sửa TẠI CHỖ các khoá meta cấp cao của `info` (symbol `level`/`message` của winston không bị đụng). */
export const redactSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    const child = info[key];
    const sensitive = SENSITIVE_KEY.test(key) && child !== null && (typeof child === "string" || typeof child === "object");
    info[key] = sensitive ? REDACTED : redactValue(child);
  }
  return info;
});
