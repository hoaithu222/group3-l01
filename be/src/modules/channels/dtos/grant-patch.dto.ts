import { z } from "zod";

export const patchGrantSchema = z.object({
  level: z.enum(["MEMBER", "MANAGER"]),
});
export type PatchGrantDto = z.infer<typeof patchGrantSchema>;
