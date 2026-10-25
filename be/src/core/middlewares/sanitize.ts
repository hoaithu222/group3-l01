import type { Request, Response, NextFunction } from "express";
import { sanitizeHtml, stripHtml } from "../utils/html-sanitizer";

/**
 * Danh sách field names được phép chứa HTML (rich text).
 * Các field này đi qua allowlist sanitizer (giữ thẻ định dạng an toàn).
 * Field khác bị strip toàn bộ HTML.
 *
 * Thêm field name vào đây khi module cần rich text (VD: content, description, body).
 */
const RICH_TEXT_FIELDS = new Set([
  "content",
  "htmlContent",
  "description",
  "richText",
]);

/**
 * Field KHÔNG BAO GIỜ được sanitize.
 *
 * Đây là điểm mấu chốt: sanitizer sửa đổi chuỗi, nên nếu nó chạm vào password
 * hay token thì giá trị bị đổi âm thầm (VD mật khẩu `a<b>c` thành `ac`) và
 * người dùng không đăng nhập được. Ngoài ra dữ liệu kỹ thuật (code, JSON, ...)
 * của các field kỹ thuật cũng phải giữ nguyên byte.
 */
const RAW_FIELDS = new Set([
  // Bí mật — phải giữ nguyên tuyệt đối
  "password",
  "newPassword",
  "oldPassword",
  "currentPassword",
  "confirmPassword",
  "passwordConfirmation",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiKey",
  "secret",
  "signature",
  "code",
  "otp",
  "captcha",
  // Payload kỹ thuật — sanitize sẽ làm hỏng dữ liệu
  "input",
  "output",
  "source",
  "text",
  "raw",
  "rawText",
  "payload",
  "json",
  "csv",
  "xml",
  "yaml",
  "markdown",
  "contentMd",
  "template",
  "diff",
  "original",
  "modified",
  "base64",
  "data",
  "query",
]);

/** Giới hạn độ sâu đệ quy — chặn deeply-nested JSON gây stack overflow. */
const MAX_DEPTH = 12;

/** Giới hạn số phần tử mảng được duyệt — chặn payload phình to gây CPU DoS. */
const MAX_ARRAY_ITEMS = 5_000;

/** Giới hạn độ dài chuỗi được sanitize; dài hơn thì cắt bớt phần đuôi. */
const MAX_STRING_LENGTH = 200_000;

/**
 * Prototype pollution guard — các key này không bao giờ được copy sang object
 * mới. `JSON.parse` cho phép chúng, và `sanitized[key] = ...` với key
 * `__proto__` trên object literal sẽ ghi đè prototype.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Input sanitization middleware.
 * - Mặc định: strip toàn bộ HTML tags + trim whitespace
 * - Rich text fields (RICH_TEXT_FIELDS): allowlist sanitizer, giữ thẻ an toàn
 * - Raw fields (RAW_FIELDS): giữ nguyên, không đụng tới
 *
 * Chạy trước validation, sau body parser.
 * Đây là lớp phòng thủ thứ nhất chống XSS (stored/reflected) — tầng render
 * vẫn phải escape/DOMPurify độc lập.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = deepSanitize(req.body, undefined, 0);
  }

  // Express 5 định nghĩa req.query là getter chỉ-đọc — gán trực tiếp sẽ throw.
  // Ghi đè bằng defineProperty để tương thích cả Express 4 lẫn 5.
  if (req.query && typeof req.query === "object") {
    const cleaned = deepSanitize(req.query, undefined, 0);
    try {
      Object.defineProperty(req, "query", {
        value: cleaned,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      // Không ghi đè được thì bỏ qua — validateQuery vẫn chặn giá trị xấu.
    }
  }

  next();
}

/**
 * Đệ quy sanitize tất cả string values trong object.
 * @param obj - Giá trị cần sanitize
 * @param currentKey - Key hiện tại (dùng để chọn chế độ sanitize)
 * @param depth - Độ sâu hiện tại (chặn đệ quy vô hạn)
 */
function deepSanitize<T>(obj: T, currentKey: string | undefined, depth: number): T {
  if (depth > MAX_DEPTH) return obj;

  if (typeof obj === "string") {
    if (currentKey !== undefined && RAW_FIELDS.has(currentKey)) return obj;

    const value = obj.length > MAX_STRING_LENGTH ? obj.slice(0, MAX_STRING_LENGTH) : obj;

    if (currentKey !== undefined && RICH_TEXT_FIELDS.has(currentKey)) {
      return sanitizeHtml(value) as T;
    }
    return stripHtml(value) as T;
  }

  if (Array.isArray(obj)) {
    const slice = obj.length > MAX_ARRAY_ITEMS ? obj.slice(0, MAX_ARRAY_ITEMS) : obj;
    return slice.map((item) => deepSanitize(item, currentKey, depth + 1)) as T;
  }

  if (obj && typeof obj === "object" && !(obj instanceof Date) && !Buffer.isBuffer(obj)) {
    const sanitized: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      sanitized[key] = deepSanitize(value, key, depth + 1);
    }
    // Trả về plain object (có prototype) để Zod xử lý bình thường.
    return Object.assign({}, sanitized) as T;
  }

  return obj;
}
