import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { booleanQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const SEARCH_TYPES = ["messages", "files", "channels", "people", "meetings"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * `GET /workspaces/:workspaceId/search` (be.md p5-04 §3). `q` chỉ chặn độ dài thô ở đây (chống payload lớn); quy tắc 2–100
 * grapheme do SERVICE kiểm để trả đúng mã nghiệp vụ `SRCH_101` thay vì `VAL_001` chung. `scopeType`/`scopeId` đi CẶP.
 */
export const workspaceSearchQuerySchema = z
  .object({
    q: z.string().max(500).default(""),
    type: z.enum(SEARCH_TYPES).default("messages"),
    authorId: objectIdSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** `true` → chỉ tin có tệp; `false`/vắng → không lọc. */
    hasFile: booleanQuerySchema.optional(),
    scopeType: z.enum(["CHANNEL", "CONVERSATION"]).optional(),
    scopeId: objectIdSchema.optional(),
    /** Gồm hội thoại 1-1 với người còn là thành viên nhóm này (D-16). */
    includeDirect: booleanQuerySchema.default(false),
    /** `base64url(createdAt|id)` của mục cuối trang trước (`encodeCursor`); kênh/người dùng cursor bù `n:<offset>`. */
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.pagination.max).default(LIMITS.search.pageSize),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Khoảng ngày không hợp lệ (from phải trước hoặc bằng to)",
    path: ["from"],
  })
  .refine((v) => (v.scopeType === undefined) === (v.scopeId === undefined), {
    message: "scopeType và scopeId phải đi cùng nhau",
    path: ["scopeId"],
  });
export type WorkspaceSearchQueryDto = z.infer<typeof workspaceSearchQuerySchema>;
