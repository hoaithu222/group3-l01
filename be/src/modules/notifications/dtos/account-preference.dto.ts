import { z } from "zod";
import { ACCOUNT_NOTIFY_MODES, LOCK_SCREEN_LEVELS } from "../entities/notification.interface";

const accountMode = z.enum(ACCOUNT_NOTIFY_MODES);
const workspaceMode = z.enum(["INHERIT", ...ACCOUNT_NOTIFY_MODES]);

/**
 * `PUT /me/notification-preferences` (p1-07 be.md §3) — cài đặt cấp TÀI KHOẢN theo loại cuộc trò chuyện.
 * `.strict()`: body có khoá `scope` (dạng cũ p0-06 cho WORKSPACE/CHANNEL/CONVERSATION) KHÔNG khớp schema này và rơi
 * xuống nhánh cũ của union ở route — tránh bỏ qua thầm lặng field lạ.
 */
export const accountPreferenceSchema = z
  .object({
    directMode: accountMode.optional(),
    groupMode: accountMode.optional(),
    channelMode: accountMode.optional(),
    lockScreenPreview: z.enum(LOCK_SCREEN_LEVELS).optional(),
    sound: z.boolean().optional(),
    dndUntil: z.string().datetime().nullable().optional(),
  })
  .strict();
export type AccountPreferenceDto = z.infer<typeof accountPreferenceSchema>;

/** `PUT /workspaces/:id/notification-preferences` — `INHERIT` = dùng cài đặt tài khoản. */
export const workspacePreferenceSchema = z
  .object({
    groupMode: workspaceMode.optional(),
    channelMode: workspaceMode.optional(),
  })
  .strict();
export type WorkspacePreferenceDto = z.infer<typeof workspacePreferenceSchema>;
