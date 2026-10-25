import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const reasonField = z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500);
const CODE_LANGUAGES = ["c-like", "python", "sql", "markup"] as const;

export const adminOverviewQuerySchema = z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") });
export type AdminOverviewQueryDto = z.infer<typeof adminOverviewQuerySchema>;

export const adminConfigSchema = z
  .object({
    thresholds: z
      .object({ medium: z.number().int().min(1).max(99), high: z.number().int().min(2).max(100) })
      .refine((t) => t.medium < t.high, "Ngưỡng Trung bình phải nhỏ hơn ngưỡng Cao"),
    minSectionTokens: z.number().int().min(8).max(200),
    commonDocFrequencyPercent: z.number().int().min(5).max(100),
    scansPerWorkspacePerDay: z.number().int().min(1).max(LIMITS.plagiarism.scansPerWorkspacePerDay),
    codeLanguages: z.array(z.enum(CODE_LANGUAGES)),
    boilerplatePhrases: z.array(z.string().trim().min(10).max(300)).max(LIMITS.plagiarism.boilerplatePhrasesMax),
    expectedVersion: z.number().int().min(1),
    reason: reasonField,
  })
  .strict();
export type AdminConfigDto = z.infer<typeof adminConfigSchema>;

export const adminReindexSchema = z.object({ workspaceId: objectIdSchema.optional(), reason: reasonField }).strict();
export type AdminReindexDto = z.infer<typeof adminReindexSchema>;
