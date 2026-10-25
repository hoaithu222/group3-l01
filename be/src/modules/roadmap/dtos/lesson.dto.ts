import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().max(500).nullish(),
  durationMinutes: z.number().int().min(1).max(24 * 60).nullish(),
  prerequisites: z.string().max(500).nullish(),
  bodyMd: z.string().max(LIMITS.roadmap.bodyMdMaxChars).default(""),
  optional: z.boolean().default(false),
});
export type CreateLessonDto = z.infer<typeof createLessonSchema>;

const resourceInputSchema = z.object({
  kind: z.enum(["LINK", "VIDEO", "TOOL", "FILE", "NOTE"]),
  group: z.string().trim().max(60).nullish(),
  title: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2000).nullish(),
  assetId: objectIdSchema.nullish(),
  note: z.string().max(500).nullish(),
  bodyMd: z.string().max(LIMITS.roadmap.noteMax).nullish(),
});

export const patchLessonSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().max(500).nullish(),
  durationMinutes: z.number().int().min(1).max(24 * 60).nullish(),
  prerequisites: z.string().max(500).nullish(),
  bodyMd: z.string().max(LIMITS.roadmap.bodyMdMaxChars).optional(),
  resources: z.array(resourceInputSchema).max(LIMITS.roadmap.resourcesPerLessonMax).optional(),
  practiceSetIds: z.array(objectIdSchema).max(LIMITS.roadmap.practiceSetsMax).optional(),
  optional: z.boolean().optional(),
});
export type PatchLessonDto = z.infer<typeof patchLessonSchema>;

export const previewSchema = z.object({ bodyMd: z.string().max(LIMITS.roadmap.bodyMdMaxChars) });
export type PreviewDto = z.infer<typeof previewSchema>;

export const putProgressSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "SKIPPED"]).optional(),
  checkedItemIds: z.array(z.string().max(40)).max(LIMITS.roadmap.checklistMax).optional(),
  selfRating: z.number().int().min(1).max(3).nullish(),
  note: z.string().max(2000).nullish(),
});
export type PutProgressDto = z.infer<typeof putProgressSchema>;
