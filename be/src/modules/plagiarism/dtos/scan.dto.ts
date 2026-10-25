import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const eligibleResourcesQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().min(2).max(100).optional(),
  folderId: z.union([objectIdSchema, z.literal("root")]).optional(),
});
export type EligibleResourcesQueryDto = z.infer<typeof eligibleResourcesQuerySchema>;

export const createScanSchema = z
  .object({
    targetResourceIds: z.array(objectIdSchema).min(1).max(LIMITS.plagiarism.targetsMax),
    mode: z.enum(["WITHIN_SELECTION", "WORKSPACE"]),
    excludeResourceIds: z.array(objectIdSchema).max(100).default([]),
    excludeFolderIds: z.array(objectIdSchema).max(20).default([]),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((v) => v.mode === "WORKSPACE" || v.targetResourceIds.length >= 2, {
    path: ["targetResourceIds"],
    message: "Chọn ít nhất 2 tệp để so với nhau",
  })
  .refine((v) => !v.targetResourceIds.some((id) => v.excludeResourceIds.includes(id)), {
    path: ["excludeResourceIds"],
    message: "Tệp đích không được nằm trong danh sách loại trừ",
  });
export type CreateScanDto = z.infer<typeof createScanSchema>;

const SCAN_STATUSES = ["QUEUED", "INDEXING", "SCANNING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const;
export const listScansQuerySchema = cursorQuerySchema.extend({ status: z.enum(SCAN_STATUSES).optional() });
export type ListScansQueryDto = z.infer<typeof listScansQuerySchema>;

export const sectionsQuerySchema = cursorQuerySchema.extend({ sourceResourceId: objectIdSchema.optional() });
export type SectionsQueryDto = z.infer<typeof sectionsQuerySchema>;

export const scanIdParamSchema = z.object({ scanId: objectIdSchema });
export const targetSectionsParamSchema = z.object({ scanId: objectIdSchema, resourceId: objectIdSchema });
export const sectionContextParamSchema = z.object({ scanId: objectIdSchema, sectionId: objectIdSchema });
