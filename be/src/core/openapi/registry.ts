/**
 * ============================================================================
 * OpenAPI Registry (Zod → OpenAPI) — p0-09
 * ============================================================================
 *
 * Registry DÙNG CHUNG cho toàn BE để đăng ký component + path OpenAPI sinh từ
 * Zod DTO THẬT (không phải JSDoc viết tay) — README p0-09 §2 "Nguồn OpenAPI":
 * DTO là nguồn validate thật của route nên schema xuất ra KHÔNG THỂ lệch khỏi
 * hành vi thật (khác `swagger-jsdoc` chép tay, dễ quên cập nhật).
 *
 * Cách dùng: import `registry` (+ helper bên dưới) trong file
 * `modules/<m>/<m>.openapi.ts` cạnh `<m>.routes.ts`, gọi `registry.registerPath()`
 * — rồi thêm 1 dòng import file đó vào `core/openapi/index.ts` (glob TĨNH, xem
 * file đó để biết lý do không dùng glob động).
 *
 * ⚠ `@asteasolutions/zod-to-openapi@7.3.4` (bản đã cài — KHÔNG tự nâng cấp) yêu
 * cầu `zod@^3.20.2`. BE đang ghim `zod@^3.22.4` (be/package.json) — KHÔNG nâng
 * `zod` lên v4 (be.md §10 rủi ro #1).
 *
 * `scripts/export-openapi.ts` import registry này để build `openapi.json`, ĐỘC
 * LẬP với `src/router.ts`/`src/app.ts` (không listen cổng, không cần DB) — xem
 * comment đầu file đó.
 * ============================================================================
 */
import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import type { ResponseConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Phải gọi TRƯỚC khi bất kỳ schema Zod nào dùng `.openapi(...)` — side effect có
// chủ đích, gọi đúng 1 lần ở module này (mọi nơi khác chỉ import lại `z` như cũ).
extendZodWithOpenApi(z);

/** Registry OpenAPI dùng chung — singleton theo tiến trình Node (không phải theo request). */
export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// ── Components chung (README p0-09 §9 việc #1) ─────────────────────────────
// Khớp field-for-field với `core/utils/response.ts` (`ApiResponse`, `PaginationMeta`,
// `CursorMeta`) và `modules/auth/dtos/auth-user.dto.ts` (`AuthUserDto`) — KHÔNG
// định nghĩa lại tay ở nơi khác, import từ đây.

/** `{ success:false, error:{code,message,details?}, timestamp, requestId? }` — mọi lỗi 4xx/5xx (errorHandler). */
export const ApiErrorSchema = registry.register(
  "ApiError",
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
  })
);

/** `core/utils/response.ts` → `PaginationMeta` (phân trang `page`/`limit`). */
export const PaginationMetaSchema = registry.register(
  "PaginationMeta",
  z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  })
);

/** `core/utils/response.ts` → `CursorMeta` (phân trang cursor — audit log, inbox, ...). */
export const CursorMetaSchema = registry.register(
  "CursorMeta",
  z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    limit: z.number().int(),
  })
);

/** `modules/auth/dtos/auth-user.dto.ts` → `AuthUserDto` (`toAuthUserDto()`) — hồ sơ người dùng hiện tại. */
export const AuthUserDtoSchema = registry.register(
  "AuthUserDto",
  z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatar: z.string().nullable(),
    role: z.string(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    status: z.string(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    privacy: z.record(z.boolean()).nullable(),
    deletionGraceUntil: z.string().nullable(),
  })
);

/**
 * Bọc `data` thành công `{ success:true, message, data, timestamp }`
 * (`ResponseUtils.success`) — đặt TÊN response (`name`) để client sinh kiểu có
 * tên ổn định thay vì object ẩn danh trong `paths`.
 */
export function apiResponse<T extends z.ZodTypeAny>(name: string, data: T) {
  return registry.register(
    name,
    z.object({
      success: z.literal(true),
      message: z.string(),
      data,
      timestamp: z.string().datetime(),
    })
  );
}

/** Bọc danh sách cursor `{ success:true, message, data:T[], meta:CursorMeta, timestamp }` (`ResponseUtils.cursor`). */
export function cursorResponse<T extends z.ZodTypeAny>(name: string, item: T) {
  return registry.register(
    name,
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: z.array(item),
      meta: CursorMetaSchema,
      timestamp: z.string().datetime(),
    })
  );
}

/** Bọc danh sách phân trang `{ success:true, message, data:T[], meta:PaginationMeta, timestamp }` (`ResponseUtils.paginated`). */
export function paginatedResponse<T extends z.ZodTypeAny>(name: string, item: T) {
  return registry.register(
    name,
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: z.array(item),
      meta: PaginationMetaSchema,
      timestamp: z.string().datetime(),
    })
  );
}

/**
 * Response lỗi chuẩn theo MÃ HTTP — tham chiếu `ApiError` (KHÔNG phân biệt theo
 * mã lỗi nghiệp vụ: 1 status OpenAPI không hợp lý khi gắn N schema khác tên
 * nhau cho N mã lỗi nghiệp vụ cùng trả cùng status).
 *
 * ⚠ Đơn giản hoá so với README p0-09 be.md §3 mẫu (`errorResponses(["VAL_001", ...])`
 * nhận MÃ LỖI rồi tự tra HTTP status): repo hiện CHƯA có bảng ánh xạ tập trung
 * `mã lỗi → HTTP status` (status hiện quyết định tại nơi `throw new AppError(msg,
 * status, code)`, rải rác từng module) — `core/utils/error.codes.ts` chỉ có
 * `ErrorCode`/`ErrorMessages`. Thêm `ERROR_CODE_META` tập trung là việc lớn hơn
 * phạm vi đợt này; hàm dưới nhận thẳng danh sách HTTP status.
 */
export function errorResponses(statusCodes: number[]): Record<number, ResponseConfig> {
  const out: Record<number, ResponseConfig> = {};
  for (const code of statusCodes) {
    out[code] = {
      description: `Lỗi (${code})`,
      content: { "application/json": { schema: ApiErrorSchema } },
    };
  }
  return out;
}
