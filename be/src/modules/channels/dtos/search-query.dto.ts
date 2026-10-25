import { z } from "zod";

export const searchChannelNamesQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
});
export type SearchChannelNamesQueryDto = z.infer<typeof searchChannelNamesQuerySchema>;
