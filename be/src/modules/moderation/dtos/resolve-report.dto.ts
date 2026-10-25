import { z } from "zod";
import { objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";

/** `POST /reports/:reportId/resolve` — người kiểm duyệt phạm vi. `reason` bắt buộc (10–500) — ghi audit + hiện cho tác giả khi gỡ tin. */
export const resolveReportSchema = reasonSchema.extend({
  action: z.enum(["REMOVE_MESSAGE", "DISMISS", "WARN_AUTHOR"]),
});
export type ResolveReportDto = z.infer<typeof resolveReportSchema>;

export const workspaceIdParamSchema = z.object({ workspaceId: objectIdSchema });
export const conversationIdParamSchema = z.object({ conversationId: objectIdSchema });
