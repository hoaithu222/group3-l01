import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const reactionParamsSchema = z.object({
  id: objectIdSchema,
  emoji: z.string().min(1).max(32),
});
export type ReactionParamsDto = z.infer<typeof reactionParamsSchema>;
