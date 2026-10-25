import { z } from "zod";
import { expectedVersionSchema } from "../../../shared/dto/common-schemas";

export const archiveWorkspaceSchema = expectedVersionSchema.extend({
  note: z.string().trim().max(500).optional(),
});
export type ArchiveWorkspaceDto = z.infer<typeof archiveWorkspaceSchema>;

export const restoreWorkspaceSchema = expectedVersionSchema;
export type RestoreWorkspaceDto = z.infer<typeof restoreWorkspaceSchema>;
