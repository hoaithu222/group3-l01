/**
 * Danh sách TĨNH mọi module `*.openapi.ts` — mỗi file tự
 * `registry.registerPath(...)` (side effect) lúc được import ở đây.
 *
 * CỐ Ý liệt kê tay (không glob động `require.context`/glob runtime) — README
 * p0-09 be.md §5.1 bước 1: `scripts/export-openapi.ts` cần sinh được OpenAPI mà
 * KHÔNG import `src/router.ts` (tránh phụ thuộc vòng/side-effect ẩn khi chạy độc
 * lập, không server, không DB). Thêm 1 dòng mỗi khi viết
 * `modules/<m>/<m>.openapi.ts` mới (README §9 việc #3 — auth trước, các module
 * còn lại chuyển dần khỏi JSDoc `swagger-jsdoc`).
 */
import "../../modules/auth/auth.openapi";

export { registry, apiResponse, cursorResponse, paginatedResponse, errorResponses } from "./registry";
export { ApiErrorSchema, PaginationMetaSchema, CursorMetaSchema, AuthUserDtoSchema } from "./registry";
