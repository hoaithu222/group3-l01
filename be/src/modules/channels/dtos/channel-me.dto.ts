import { z } from "zod";

export const channelMeSchema = z.object({
  notifyMode: z.enum(["INHERIT", "ALL_MESSAGES", "MENTIONS_AND_THREADS", "MUTED"]).optional(),
  pinned: z.boolean().optional(),
  position: z.number().finite().optional(),
});
export type ChannelMeDto = z.infer<typeof channelMeSchema>;
