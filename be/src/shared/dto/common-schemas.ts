import { z } from "zod";
import { LIMITS } from "../../core/constants/limits";
import { normalizePhone } from "../../core/utils/phone";

/** MongoDB ObjectId — 24 hex characters */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "ID không hợp lệ (phải là ObjectId 24 ký tự hex)");

/** Slug: lowercase alphanumeric + hyphen, 2-50 chars */
export const slugSchema = z
  .string()
  .min(2, "Slug tối thiểu 2 ký tự")
  .max(50, "Slug tối đa 50 ký tự")
  .regex(/^[a-z0-9-]+$/, "Slug chỉ chứa chữ thường, số và dấu gạch ngang");

/** Paginated query params with coercion */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/** Params schema chung cho route `/:id` (MongoDB ObjectId). */
export const idParamSchema = z.object({ id: objectIdSchema });

/** Cursor pagination — dùng cho danh sách theo thời gian (audit log, inbox, ...). */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITS.pagination.max)
    .default(LIMITS.pagination.default),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** Optimistic concurrency — client gửi version đã đọc trước khi update. */
export const expectedVersionSchema = z.object({ expectedVersion: z.number().int().min(0) });

/** Lý do bắt buộc cho hành động nhạy cảm (khoá/mở/đổi role/xoá). */
export const reasonSchema = z.object({
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500),
});

/**
 * Boolean từ query string. KHÔNG dùng `z.coerce.boolean()` vì `Boolean("false") === true` — `?hasFile=false` sẽ bị hiểu thành `true`.
 * (Nâng từ `discovery` p1-09 lên dùng chung ở p5-04.)
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

/**
 * Danh sách enum trong query string: `?status=A,B` hoặc lặp `?status=A&status=B` → mảng đã kiểm từng giá trị (giá trị lạ → 400), tối đa
 * bằng số giá trị của enum (chặn lặp vô hạn). (p2-07 nâng từ `admin-meetings.dto` p2-04 lên dùng chung.)
 */
export const csvEnum = <U extends string, T extends Readonly<[U, ...U[]]>>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));

/** Nonce chống replay (`GET /auth/nonce`) — 32 ký tự base64url (24 byte gốc). */
export const nonceSchema = z
  .string()
  .length(32, "Nonce không hợp lệ")
  .regex(/^[A-Za-z0-9_-]{32}$/, "Nonce không hợp lệ");

/**
 * Số điện thoại NGƯỜI DÙNG NHẬP (đăng ký, hồ sơ) → E.164 (`+84912345678`) qua `normalizePhone`; sai hình dạng → 400 `VAL_001`.
 * Đầu ra là chuỗi đã chuẩn hoá nên service/repository ghi nguyên văn. Dùng `.nullable()` ở nơi cho phép xoá số.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Số điện thoại không được để trống")
  .max(32, "Số điện thoại không hợp lệ")
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số điện thoại không hợp lệ" });
      return z.NEVER;
    }
    return phone;
  });
