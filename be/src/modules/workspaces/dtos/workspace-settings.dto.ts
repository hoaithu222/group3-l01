import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";

/**
 * `PATCH /workspaces/:id/settings` (OWNER — be.md p3-04 §3). `expectedVersion` = `Workspace.version` (409 `RES_003` khi lệch).
 * `guestPolicy` thay THẾ toàn bộ (đủ 4 trường); trần cứng theo `LIMITS.guest` — override runtime (nếu thấp hơn) áp ở đọc.
 */
export const workspaceSettingsSchema = z
  .object({
    joinPolicy: z.enum(["OPEN", "APPROVAL"]).optional(),
    guestPolicy: z
      .object({
        enabled: z.boolean(),
        maxGuests: z.number().int().min(0).max(LIMITS.guest.maxPerWorkspace),
        maxDays: z.number().int().min(1).max(LIMITS.guest.maxDays),
        memberCanInvite: z.boolean(),
      })
      .optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.joinPolicy !== undefined || v.guestPolicy !== undefined, "Không có thay đổi");

export type WorkspaceSettingsDto = z.infer<typeof workspaceSettingsSchema>;
