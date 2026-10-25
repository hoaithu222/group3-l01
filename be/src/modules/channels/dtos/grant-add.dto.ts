import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const addGrantsSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(LIMITS.channel.grantBatchMax),
  level: z.enum(["MEMBER", "MANAGER"]).default("MEMBER"),
});
export type AddGrantsDto = z.infer<typeof addGrantsSchema>;
