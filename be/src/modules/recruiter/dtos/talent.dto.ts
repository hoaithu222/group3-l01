import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** Mã kỹ năng: chữ thường/số/gạch ngang (khớp `SkillDefinition.code`). Nhận `?skills=a,b` hoặc lặp `?skills=a&skills=b`. */
const skillCodes = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[a-z0-9-]{2,40}$/, "Mã kỹ năng không hợp lệ")).max(LIMITS.talent.filterSkillsMax));

/** `GET /companies/:companyId/talent/search` (be.md §3). Số/cursor lạ → 400 `VAL_001`. */
export const talentSearchQuerySchema = z.object({
  skills: skillCodes.optional(),
  minContribution: z.coerce.number().min(0).max(100).optional(),
  minBadges: z.coerce.number().int().min(0).max(50).optional(),
  role: z.string().trim().max(LIMITS.talent.preferredRoleMax).optional(),
  location: z.string().trim().max(LIMITS.talent.locationMax).optional(),
  q: z.string().trim().min(2).max(LIMITS.talent.keywordMax).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.talent.searchPageMax).default(20),
});
export type TalentSearchQuery = z.infer<typeof talentSearchQuerySchema>;

export const talentUserParamSchema = z.object({ companyId: objectIdSchema, userId: objectIdSchema });
export const talentProofParamSchema = z.object({ companyId: objectIdSchema, userId: objectIdSchema, skillId: objectIdSchema });
