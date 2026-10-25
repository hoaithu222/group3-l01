import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

/** Tên: cắt khoảng trắng, 1..`nameMax` ký tự HIỂN THỊ (grapheme — emoji ghép/dấu tiếng Việt tách rời tính 1). */
const nameSchema = z
  .string()
  .trim()
  .min(1, "Tên bảng trắng không được để trống")
  .refine((v) => graphemeLength(v) <= LIMITS.whiteboard.nameMax, `Tên bảng trắng tối đa ${LIMITS.whiteboard.nameMax} ký tự`);

const visibilitySchema = z.enum(["WORKSPACE", "PRIVATE"]);

export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });
export const whiteboardParamsSchema = z.object({ id: objectIdSchema });
export const collaboratorParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const snapshotParamsSchema = z.object({ id: objectIdSchema, sid: objectIdSchema });

export const createWhiteboardSchema = z.object({ name: nameSchema, visibility: visibilitySchema.default("WORKSPACE") });
export type CreateWhiteboardDto = z.infer<typeof createWhiteboardSchema>;

/**
 * `name`/`visibility` cần `whiteboard.manage`; CHỈ `thumbnailAssetId` thì `whiteboard.edit` là đủ (người vẽ cập nhật ảnh thu nhỏ khi rời bảng) — service tự phân loại.
 * Ảnh thu nhỏ chỉ ĐẶT được (không có thao tác gỡ trong P0).
 */
export const updateWhiteboardSchema = z
  .object({
    name: nameSchema.optional(),
    visibility: visibilitySchema.optional(),
    /** Bắt buộc `true` khi đổi PRIVATE → WORKSPACE (mọi thành viên sẽ xem/sửa được) — như tài liệu (p6-01). */
    confirmPublic: z.boolean().optional(),
    thumbnailAssetId: objectIdSchema.optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.name !== undefined || v.visibility !== undefined || v.thumbnailAssetId !== undefined, "Cần ít nhất một trường thay đổi");
export type UpdateWhiteboardDto = z.infer<typeof updateWhiteboardSchema>;

export const listWhiteboardsQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
export type ListWhiteboardsQueryDto = z.infer<typeof listWhiteboardsQuerySchema>;

export const archiveWhiteboardSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type ArchiveWhiteboardDto = z.infer<typeof archiveWhiteboardSchema>;

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

/** Query của endpoint nội bộ `access`. */
export const internalAccessQuerySchema = z.object({ userId: objectIdSchema, sv: z.coerce.number().int().min(0).default(0) });
export const internalWhiteboardParamsSchema = z.object({ id: objectIdSchema });
