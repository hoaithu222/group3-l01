import { z } from "zod";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { LIMITS } from "../../core/constants/limits";

/** `GET /presence?userIds=a,b,c` — CSV → mảng ObjectId, tối đa `presenceQueryMaxIds` (be.md §3/§9). */
export const presenceQuerySchema = z.object({
  userIds: z
    .string()
    .transform((s) => s.split(","))
    .pipe(z.array(objectIdSchema).min(1).max(LIMITS.realtime.presenceQueryMaxIds)),
});
export type PresenceQuery = z.infer<typeof presenceQuerySchema>;
