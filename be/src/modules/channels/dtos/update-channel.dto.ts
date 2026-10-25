import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { expectedVersionSchema } from "../../../shared/dto/common-schemas";
import { channelNameSchema } from "./create-channel.dto";

/**
 * Cấu hình phòng thoại kênh VOICE (p2-03 be.md §2). TRẦN CỨNG lúc biên soạn = `LIMITS.voice.maxParticipants` (vượt ⇒ 400, không kẹp
 * lặng lẽ để người quản lý không tưởng đã đặt được 20 chỗ); sàn 2 (phòng 1 người không có nghĩa). `.strict()` chặn khoá lạ; ít nhất một trường.
 */
export const voiceSettingsPatchSchema = z
  .object({
    allowVideo: z.boolean().optional(),
    maxParticipants: z.number().int().min(2).max(LIMITS.voice.maxParticipants).optional(),
  })
  .strict()
  .refine((v) => v.allowVideo !== undefined || v.maxParticipants !== undefined, "Cần ít nhất một trường cấu hình phòng thoại");

export const updateChannelSchema = z
  .object({
    name: channelNameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    postingPolicy: z.enum(["MEMBERS", "ADMINS_ONLY"]).optional(),
    /** Chỉ kênh `VOICE` (kênh khác ⇒ 400 `VAL_001` ở service). */
    voiceSettings: voiceSettingsPatchSchema.optional(),
  })
  .merge(expectedVersionSchema);
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;
