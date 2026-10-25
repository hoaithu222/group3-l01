import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, slugSchema } from "../../../shared/dto/common-schemas";
import { ROADMAP_SUBJECT_STATUSES, ROADMAP_UNLOCK_MODES } from "../entities/subject.interface";

const studyDaysSchema = z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((v) => new Set(v).size === v.length, "Thứ học không được lặp lại");

export const createSubjectSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullish(),
  category: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).nullish(),
  icon: z.string().trim().max(60).nullish(),
  lessonLabel: z.string().trim().min(1).max(20).default("Buổi"),
  defaultStudyDays: studyDaysSchema.default([2, 5]),
  unlockMode: z.enum(ROADMAP_UNLOCK_MODES).default("FREE"),
});
export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;

export const patchSubjectSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullish(),
  category: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().max(20).nullish(),
  icon: z.string().trim().max(60).nullish(),
  coverAssetId: objectIdSchema.nullish(),
  lessonLabel: z.string().trim().min(1).max(20).optional(),
  defaultStudyDays: studyDaysSchema.optional(),
  unlockMode: z.enum(ROADMAP_UNLOCK_MODES).optional(),
});
export type PatchSubjectDto = z.infer<typeof patchSubjectSchema>;

export const createPhaseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().max(1000).nullish(),
  stageLabel: z.string().trim().max(120).nullish(),
  color: z.string().trim().max(20).nullish(),
  capstone: z.string().max(2000).nullish(),
});
export type CreatePhaseDto = z.infer<typeof createPhaseSchema>;

export const patchPhaseSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  summary: z.string().max(1000).nullish(),
  stageLabel: z.string().trim().max(120).nullish(),
  color: z.string().trim().max(20).nullish(),
  capstone: z.string().max(2000).nullish(),
});
export type PatchPhaseDto = z.infer<typeof patchPhaseSchema>;

export const reorderSchema = z.object({
  expectedVersion: z.number().int().min(1),
  phases: z.array(z.object({ id: objectIdSchema, order: z.number() })).max(LIMITS.roadmap.phasesPerSubjectMax).default([]),
  lessons: z.array(z.object({ id: objectIdSchema, phaseId: objectIdSchema, order: z.number() })).max(LIMITS.roadmap.lessonsPerSubjectMax).default([]),
});
export type ReorderDto = z.infer<typeof reorderSchema>;

export const adminSubjectsQuerySchema = z.object({
  status: z.enum(ROADMAP_SUBJECT_STATUSES).optional(),
  q: z.string().trim().min(2).max(100).optional(),
});
export type AdminSubjectsQueryDto = z.infer<typeof adminSubjectsQuerySchema>;
