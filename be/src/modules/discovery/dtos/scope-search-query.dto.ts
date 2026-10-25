import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { booleanQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

// `booleanQuerySchema` đã nâng lên `shared/dto/common-schemas.ts` (p5-04 dùng chung) — re-export để giữ import cũ.
export { booleanQuerySchema };

/**
 * `q` chỉ chặn độ dài thô ở đây (chống payload lớn); quy tắc 2–100 grapheme /
 * số từ do SERVICE kiểm để trả đúng mã nghiệp vụ `SRCH_001`/`SRCH_002`
 * thay vì `VAL_001` chung (`parseSearchTerms`).
 */
export const scopeSearchQuerySchema = z
  .object({
    q: z.string().max(500).default(""),
    authorId: objectIdSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** `true` → chỉ tin có tệp; `false`/vắng → không lọc. */
    hasFile: booleanQuerySchema.optional(),
    fileKind: z.enum(["IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"]).optional(),
    /** Chỉ có ý nghĩa với CHANNEL (hội thoại không có thread). `false` → bỏ reply trong thread. */
    includeThreads: booleanQuerySchema.default(true),
    /** `base64url(createdAt|id)` của hit cuối trang trước (`encodeCursor`). */
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.pagination.max).default(LIMITS.search.pageSize),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Khoảng ngày không hợp lệ (from phải trước hoặc bằng to)",
    path: ["from"],
  });
export type ScopeSearchQueryDto = z.infer<typeof scopeSearchQuerySchema>;
