import { z } from "zod";

export const listWorkspacesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
});
export type ListWorkspacesQueryDto = z.infer<typeof listWorkspacesQuerySchema>;
