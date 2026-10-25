import { z } from "zod";
import { objectIdSchema, paginationSchema, reasonSchema } from "../../../shared/dto/common-schemas";

export const adminListWorkspacesQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  ownerId: objectIdSchema.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sort: z.enum(["lastActivityAt", "createdAt", "memberCount", "name"]).default("lastActivityAt"),
});
export type AdminListWorkspacesQueryDto = z.infer<typeof adminListWorkspacesQuerySchema>;

export const adminArchiveSchema = reasonSchema;
export type AdminArchiveDto = z.infer<typeof adminArchiveSchema>;
