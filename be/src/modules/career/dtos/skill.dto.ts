import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { booleanQuerySchema, expectedVersionSchema, objectIdSchema, paginationSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { SKILL_CATEGORIES } from "../entities/skill.interface";

const L = LIMITS.skill;

/**
 * DTO của p6-06 (be.md §3). `criteria` nhận THÔ (`unknown`) rồi SERVICE kiểm bằng `skillCriteriaSchema` (`shared/criteria`) để trả đúng `SKILL_002`
 * (400) thay vì `VAL_001` chung — giống `criteria` của huy hiệu gamification.
 */
export const skillIdParamSchema = z.object({ id: objectIdSchema });
export const userSkillParamSchema = z.object({ id: objectIdSchema, skillId: objectIdSchema });

const labelMatch = z.array(z.string().trim().min(1).max(L.labelMax)).min(1).max(L.labelMatchMax);

const skillBase = z.object({
  name: z.string().trim().min(2).max(L.nameMax),
  description: z.string().trim().max(L.descriptionMax).nullable().optional(),
  category: z.enum(SKILL_CATEGORIES),
  labelMatch,
  criteria: z.unknown(),
  icon: z.string().trim().min(1).max(L.iconMax).regex(/^[a-z0-9-]+$/, "Tên icon chỉ gồm a-z, 0-9, dấu gạch ngang"),
  order: z.number().int().min(0).max(L.orderMax).default(0),
});

export const createSkillSchema = skillBase.extend({
  code: z.string().regex(new RegExp(`^[a-z0-9-]{2,${L.codeMax}}$`), `Mã kỹ năng 2–${L.codeMax} ký tự a-z, 0-9, dấu gạch ngang`),
});
export type CreateSkillDto = z.infer<typeof createSkillSchema>;

/** Không đổi `code`; bật/tắt đi qua `activate|deactivate` (có lý do). `reason` tuỳ chọn (ghi vào audit). */
export const updateSkillSchema = expectedVersionSchema.extend({
  name: skillBase.shape.name.optional(),
  description: skillBase.shape.description,
  category: skillBase.shape.category.optional(),
  labelMatch: labelMatch.optional(),
  criteria: z.unknown().optional(),
  icon: skillBase.shape.icon.optional(),
  order: z.number().int().min(0).max(L.orderMax).optional(),
  reason: reasonSchema.shape.reason.optional(),
});
export type UpdateSkillDto = z.infer<typeof updateSkillSchema>;

export const skillReasonSchema = reasonSchema;
export type SkillReasonDto = z.infer<typeof skillReasonSchema>;

export const adminSkillsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(60).optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  active: booleanQuerySchema.optional(),
});
export type AdminSkillsQueryDto = z.infer<typeof adminSkillsQuerySchema>;

/** Xem trước tiêu chí CHƯA lưu: `criteria` là chuỗi JSON (query string) — vắng = tiêu chí đang lưu. */
export const eligiblePreviewQuerySchema = z.object({
  criteria: z
    .string()
    .max(500)
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "criteria phải là JSON" });
        return z.NEVER;
      }
    })
    .optional(),
});
export type EligiblePreviewQueryDto = z.infer<typeof eligiblePreviewQuerySchema>;

export const labelSuggestionsQuerySchema = z.object({ q: z.string().trim().max(40).default("") });
