import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";

export const forwardTargetSchema = z.union([
  z.object({ scopeType: z.enum(["CHANNEL", "CONVERSATION"]), scopeId: objectIdSchema }),
  z.object({ directUserId: objectIdSchema }),
]);
export type ForwardTargetDto = z.infer<typeof forwardTargetSchema>;

export const forwardMessageSchema = z.object({
  forwardRequestId: z.string().uuid(),
  targets: z.array(forwardTargetSchema).min(1).max(LIMITS.conversation.forwardTargetsMax),
  note: z.string().max(1000).optional(),
});
export type ForwardMessageDto = z.infer<typeof forwardMessageSchema>;
