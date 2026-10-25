import { z } from "zod";
import { objectIdSchema, reasonSchema } from "../../shared/dto/common-schemas";

/** `GET /admin/storage/stats` — lọc theo workspace (tuỳ chọn). */
export const storageStatsQuerySchema = z.object({
  workspaceId: objectIdSchema.optional(),
});
export type StorageStatsQuery = z.infer<typeof storageStatsQuerySchema>;

/** `POST /admin/storage/cleanup` — bắt buộc lý do (hành động nhạy cảm, có audit). */
export const storageCleanupSchema = reasonSchema;
export type StorageCleanupDto = z.infer<typeof storageCleanupSchema>;
