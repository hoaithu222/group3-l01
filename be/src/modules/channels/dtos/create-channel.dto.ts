import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

function between(len: number, min: number, max: number): boolean {
  return len >= min && len <= max;
}

export const channelNameSchema = z
  .string()
  .trim()
  .refine(
    (s) => between(graphemeLength(s), LIMITS.channel.nameMin, LIMITS.channel.nameMax),
    `Tên kênh ${LIMITS.channel.nameMin}-${LIMITS.channel.nameMax} ký tự`
  );

export const createChannelSchema = z.object({
  name: channelNameSchema,
  description: z.string().trim().max(LIMITS.channel.descriptionMax).optional(),
  type: z.enum(["TEXT", "VOICE", "POMODORO"]).default("TEXT"),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  postingPolicy: z.enum(["MEMBERS", "ADMINS_ONLY"]).default("MEMBERS"),
  initialMemberIds: z.array(objectIdSchema).max(LIMITS.channel.initialMembersMax).default([]),
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;
