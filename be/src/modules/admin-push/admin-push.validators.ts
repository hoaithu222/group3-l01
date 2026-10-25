import { z } from "zod";
import { objectIdSchema, reasonSchema } from "../../shared/dto/common-schemas";

/**
 * be.md viết pseudo-code `reason: reasonSchema` nhưng `reasonSchema` đã là
 * `z.object({ reason })` — dùng `.merge()` để có field `reason` phẳng ngay
 * trên body (cùng cách `users/dtos/anonymize.dto.ts` xử lý điểm này).
 */
export const adminPushTestSchema = z
  .object({
    userId: objectIdSchema,
    type: z.enum(["message.new", "call.incoming", "meeting.reminder"]).default("message.new"),
  })
  .merge(reasonSchema);

export type AdminPushTestDto = z.infer<typeof adminPushTestSchema>;
