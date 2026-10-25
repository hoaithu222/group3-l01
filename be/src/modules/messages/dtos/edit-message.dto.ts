import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { mentionInputSchema } from "./send-message.dto";

export const editMessageSchema = z.object({
  content: z.string().max(LIMITS.message.maxChars * 4),
  mentions: z.array(mentionInputSchema).max(LIMITS.message.mentionsMax).default([]),
  expectedVersion: z.number().int().min(1),
});
export type EditMessageDto = z.infer<typeof editMessageSchema>;
