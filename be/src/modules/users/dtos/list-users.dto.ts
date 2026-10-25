import { z } from "zod";
import { ROLE_LIST } from "../../../core/constants";
import { paginationSchema } from "../../../shared/dto/common-schemas";

export const listUsersQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLE_LIST as [string, ...string[]]).optional(),
  status: z.enum(["ACTIVE", "LOCKED", "PENDING_DELETION", "ANONYMIZED"]).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
