import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

/** Tiêu đề: cắt khoảng trắng, 1..`titleMax` ký tự HIỂN THỊ (grapheme — emoji ghép/dấu tiếng Việt tách rời tính 1). */
const titleSchema = z
  .string()
  .trim()
  .min(1, "Tiêu đề không được để trống")
  .refine((v) => graphemeLength(v) <= LIMITS.document.titleMax, `Tiêu đề tối đa ${LIMITS.document.titleMax} ký tự`);

const visibilitySchema = z.enum(["WORKSPACE", "PRIVATE"]);

export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });
export const documentParamsSchema = z.object({ id: objectIdSchema });
export const collaboratorParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const snapshotParamsSchema = z.object({ id: objectIdSchema, sid: objectIdSchema });

export const createDocumentSchema = z.object({ title: titleSchema, visibility: visibilitySchema.default("WORKSPACE") });
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    visibility: visibilitySchema.optional(),
    /** Bắt buộc `true` khi đổi PRIVATE → WORKSPACE (mọi thành viên sẽ xem/sửa được) — `DOC_002`. */
    confirmPublic: z.boolean().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.title !== undefined || v.visibility !== undefined, "Cần ít nhất một trường thay đổi");
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
export type ListDocumentsQueryDto = z.infer<typeof listDocumentsQuerySchema>;

export const archiveDocumentSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type ArchiveDocumentDto = z.infer<typeof archiveDocumentSchema>;

export const addCollaboratorsSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(20),
  role: z.enum(["EDITOR", "VIEWER"]),
});
export type AddCollaboratorsDto = z.infer<typeof addCollaboratorsSchema>;

export const createSnapshotSchema = z.object({
  label: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreateSnapshotDto = z.infer<typeof createSnapshotSchema>;

export const listSnapshotsQuerySchema = cursorQuerySchema.extend({ kind: z.enum(["AUTO", "MANUAL", "PRE_RESTORE"]).optional() });
export type ListSnapshotsQueryDto = z.infer<typeof listSnapshotsQuerySchema>;

export const restoreSnapshotSchema = z.object({ expectedVersion: z.number().int().min(1) });
export type RestoreSnapshotDto = z.infer<typeof restoreSnapshotSchema>;

export const attachAssetSchema = z.object({ assetId: objectIdSchema });
export type AttachAssetDto = z.infer<typeof attachAssetSchema>;

/** Query của endpoint nội bộ `access`. */
export const internalAccessQuerySchema = z.object({ userId: objectIdSchema, sv: z.coerce.number().int().min(0).default(0) });
export const internalDocumentParamsSchema = z.object({ id: objectIdSchema });
