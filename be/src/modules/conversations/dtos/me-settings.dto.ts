import { z } from "zod";

/** be.md §3 — `PATCH /conversations/:id/me`. */
export const meSettingsSchema = z
  .object({
    pinned: z.boolean().optional(),
    notifyMode: z.enum(["INHERIT", "ALL", "MENTIONS", "MUTED"]).optional(),
    mutedUntil: z.string().datetime().nullable().optional(), // null = bỏ tắt tiếng
    archived: z.boolean().optional(),
    markedUnread: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Cần ít nhất 1 trường để cập nhật" });
export type MeSettingsDto = z.infer<typeof meSettingsSchema>;
