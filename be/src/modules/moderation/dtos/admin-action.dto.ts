import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

export const ADMIN_ACTIONS = [
  "DISMISS",
  "REMOVE_CONTENT",
  "WARN_AUTHOR",
  "LOCK_AUTHOR",
  "ARCHIVE_CHANNEL",
  "DISSOLVE_CONVERSATION",
] as const;
export type AdminActionValue = (typeof ADMIN_ACTIONS)[number];

/** `PATCH /admin/reports/:reportId` (`LOCK_AUTHOR` cần thêm `user:update` — kiểm ở service). */
export const adminActionSchema = reasonSchema.extend({ action: z.enum(ADMIN_ACTIONS) });
export type AdminActionDto = z.infer<typeof adminActionSchema>;

/** `POST /admin/messages/:messageId/remove`. */
export const adminRemoveMessageSchema = reasonSchema;
export type AdminRemoveMessageDto = z.infer<typeof adminRemoveMessageSchema>;
