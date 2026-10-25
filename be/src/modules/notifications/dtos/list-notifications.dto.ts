import { z } from "zod";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { NOTIFICATION_FILTERS } from "../entities/notification.interface";

/**
 * Boolean từ query string. KHÔNG dùng `z.coerce.boolean()` (be.md §3 viết vậy): `Boolean("false") === true`
 * nên `?unreadOnly=false` sẽ bị hiểu thành "chỉ chưa đọc". (Định nghĩa cục bộ — không import chéo module `discovery`.)
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

export const listNotificationsQuerySchema = cursorQuerySchema.extend({
  filter: z.enum(NOTIFICATION_FILTERS).default("all"),
  workspaceId: objectIdSchema.optional(),
  unreadOnly: booleanQuerySchema.default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const unreadCountQuerySchema = z.object({
  workspaceId: objectIdSchema.optional(),
});
export type UnreadCountQuery = z.infer<typeof unreadCountQuerySchema>;

export const readAllSchema = z.object({
  filter: z.enum(NOTIFICATION_FILTERS).default("all"),
  workspaceId: objectIdSchema.optional(),
  before: z.string().datetime(),
});
export type ReadAllDto = z.infer<typeof readAllSchema>;
