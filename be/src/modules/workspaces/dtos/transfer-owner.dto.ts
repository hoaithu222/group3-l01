import { z } from "zod";
import { objectIdSchema, expectedVersionSchema } from "../../../shared/dto/common-schemas";

export const transferOwnerSchema = expectedVersionSchema.extend({
  toUserId: objectIdSchema,
  confirmName: z.string().trim().min(1).max(120),
});
export type TransferOwnerDto = z.infer<typeof transferOwnerSchema>;
