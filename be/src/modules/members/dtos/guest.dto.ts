import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * `PATCH /workspaces/:id/members/:userId/guest`. `expiresAt` phải > now và ≤ now + maxDays (service kiểm — trần
 * `maxDays` còn phụ thuộc `guestPolicy` của nhóm). `expectedVersion` = `MemberCard.version` (= `expiryVersion`, ≥ 1).
 */
export const updateGuestSchema = z
  .object({
    expiresAt: z.coerce.date().optional(),
    channelIds: z.array(objectIdSchema).min(1).max(LIMITS.guest.designatedChannelsMax).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.expiresAt !== undefined || v.channelIds !== undefined, "Không có thay đổi");
export type UpdateGuestDto = z.infer<typeof updateGuestSchema>;
