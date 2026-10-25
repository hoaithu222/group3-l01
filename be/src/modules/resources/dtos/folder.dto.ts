import { z } from "zod";
import { LIMITS } from "../../../core/constants";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const folderName = z.string().trim().min(1).max(LIMITS.resource.folderNameMax);

export const workspaceParamSchema = z.object({ workspaceId: objectIdSchema });

export const createFolderSchema = z.object({
  name: folderName,
  parentId: objectIdSchema.optional(),
});
export type CreateFolderDto = z.infer<typeof createFolderSchema>;

/** `parentId: null` = đưa về gốc; vắng mặt = không đổi cha. Phải có `name` hoặc `parentId`. */
export const updateFolderSchema = z
  .object({
    name: folderName.optional(),
    parentId: objectIdSchema.nullable().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, { message: "Không có thay đổi" });
export type UpdateFolderDto = z.infer<typeof updateFolderSchema>;

export const listFoldersQuerySchema = z.object({ parentId: objectIdSchema.optional() });
export type ListFoldersQueryDto = z.infer<typeof listFoldersQuerySchema>;

/** `z.coerce.boolean()` coi "false" là `true` — dùng enum chuỗi. */
export const deleteFolderQuerySchema = z.object({
  recursive: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type DeleteFolderQueryDto = z.infer<typeof deleteFolderQuerySchema>;
