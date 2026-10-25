import { z } from "zod";
import { LIMITS } from "../../core/constants/limits";

/** be.md §3 — `GET /scopes/:scopeType/:scopeId/mentionables?q=&limit=`. */
export const mentionablesQuerySchema = z.object({
  q: z.string().trim().max(60).default(""),
  limit: z.coerce.number().int().min(1).max(LIMITS.mention.mentionablesLimit).default(LIMITS.mention.mentionablesLimit),
  /** p3-04 — kèm danh sách vai trò có thể `@role` (`?includeRoles=true`, chỉ ở kênh). */
  includeRoles: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type MentionablesQueryDto = z.infer<typeof mentionablesQuerySchema>;
