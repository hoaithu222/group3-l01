import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";

/**
 * be.md §3 — `POST /conversations`. `title`/`memberIds` giới hạn "thô" bằng
 * ký tự (`titleMax * 4`) — độ dài GRAPHEME thật (1-80, `CONV_010`) kiểm ở
 * service (`graphemeLength`, giống `channel.service.ts`/`workspace.service.ts`).
 */
export const createGroupSchema = z.object({
  workspaceId: objectIdSchema,
  title: z.string().trim().min(LIMITS.conversation.titleMin).max(LIMITS.conversation.titleMax * 4),
  memberIds: z.array(objectIdSchema).min(1).max(LIMITS.conversation.membersMax - 1),
  avatarAssetId: objectIdSchema.optional(),
});
export type CreateGroupDto = z.infer<typeof createGroupSchema>;
