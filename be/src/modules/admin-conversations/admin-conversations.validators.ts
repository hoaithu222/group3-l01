import { z } from "zod";
import { objectIdSchema, paginationSchema } from "../../shared/dto/common-schemas";

/** be.md §3/§4 — `GET /admin/workspaces/:id/conversations`. */
export const adminListConversationsQuerySchema = paginationSchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "DISSOLVED"]).optional(),
});
export type AdminListConversationsQueryDto = z.infer<typeof adminListConversationsQuerySchema>;

/** be.md §3/§4 — `POST /admin/conversations/:id/dissolve`. */
export const adminDissolveSchema = z.object({
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500),
  reportId: objectIdSchema,
});
export type AdminDissolveDto = z.infer<typeof adminDissolveSchema>;
