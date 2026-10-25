import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";

/** be.md §3 — `PATCH /conversations/:id`. */
export const patchConversationSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.conversation.titleMax * 4).optional(),
  avatarAssetId: objectIdSchema.nullable().optional(),
  settings: z
    .object({
      membersCanAdd: z.boolean(),
      memberCanPin: z.boolean(),
      mentionAllRole: z.enum(["ADMIN", "MEMBER"]),
    })
    .partial()
    .optional(),
  /** p3-04 — bật/tắt cho phép thêm khách vào nhóm chat (OWNER/ADMIN nhóm; `conversation.update`). */
  allowGuests: z.boolean().optional(),
  expectedVersion: z.number().int().min(1),
});
export type PatchConversationDto = z.infer<typeof patchConversationSchema>;

/** be.md §3 — `POST /conversations/:id/dissolve`. */
export const dissolveSchema = z.object({ confirmTitle: z.string().max(400) });
export type DissolveDto = z.infer<typeof dissolveSchema>;

/** be.md §3 — `POST /admin/conversations/:id/dissolve`. */
export const adminDissolveSchema = z.object({
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500),
  reportId: objectIdSchema,
});
export type AdminDissolveDto = z.infer<typeof adminDissolveSchema>;
