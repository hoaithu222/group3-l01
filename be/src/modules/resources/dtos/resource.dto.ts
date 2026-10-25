import { z } from "zod";
import { LIMITS } from "../../../core/constants";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { RESOURCE_TYPES } from "../entities/resource.interface";

const resourceName = z.string().trim().min(1).max(LIMITS.resource.resourceNameMax);
const description = z.string().trim().max(LIMITS.resource.descriptionMax);
const tags = z.array(z.string().trim().min(1).max(30)).max(LIMITS.resource.tagsMax);

export const createResourceSchema = z.object({
  assetId: objectIdSchema,
  folderId: objectIdSchema.optional(),
  /** Mặc định = tên gốc của tệp (`Asset.originalName`). */
  name: resourceName.optional(),
  description: description.optional(),
  tags: tags.default([]),
});
export type CreateResourceDto = z.infer<typeof createResourceSchema>;

export const listResourcesQuerySchema = cursorQuerySchema.extend({
  /** `root` hoặc id thư mục; vắng mặt = gốc. Bị bỏ qua khi có `q` (tìm toàn workspace). */
  folderId: z.union([objectIdSchema, z.literal("root")]).optional(),
  q: z.string().trim().min(2).max(100).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  sort: z.enum(["createdAt", "name", "size"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListResourcesQueryDto = z.infer<typeof listResourcesQuerySchema>;

/** `folderId: null` = về gốc; `description: null` = xoá mô tả. Phải có ít nhất 1 trường đổi. */
export const updateResourceSchema = z
  .object({
    name: resourceName.optional(),
    description: description.nullable().optional(),
    tags: tags.optional(),
    folderId: objectIdSchema.nullable().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.tags !== undefined || v.folderId !== undefined,
    { message: "Không có thay đổi" }
  );
export type UpdateResourceDto = z.infer<typeof updateResourceSchema>;

export const resourceUrlQuerySchema = z.object({
  variant: z.enum(["original", "preview", "download"]).default("original"),
});
export type ResourceUrlQueryDto = z.infer<typeof resourceUrlQuerySchema>;

export const trashQuerySchema = cursorQuerySchema;
export type TrashQueryDto = z.infer<typeof trashQuerySchema>;

export const trashItemParamSchema = z.object({ workspaceId: objectIdSchema, resourceId: objectIdSchema });
