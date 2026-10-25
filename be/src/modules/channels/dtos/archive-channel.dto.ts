import { z } from "zod";
import { expectedVersionSchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const archiveChannelSchema = expectedVersionSchema.extend({
  replacementDefaultChannelId: objectIdSchema.optional(),
});
export type ArchiveChannelDto = z.infer<typeof archiveChannelSchema>;

export const restoreChannelSchema = expectedVersionSchema;
export type RestoreChannelDto = z.infer<typeof restoreChannelSchema>;
