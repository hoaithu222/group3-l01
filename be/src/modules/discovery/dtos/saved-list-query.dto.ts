import { z } from "zod";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

/** `GET /me/saved` — lọc theo loại phạm vi/workspace lúc LƯU (`SavedMessage.scopeType/workspaceId`). */
export const savedListQuerySchema = cursorQuerySchema.extend({
  scopeType: z.enum(["CHANNEL", "CONVERSATION"]).optional(),
  workspaceId: objectIdSchema.optional(),
});
export type SavedListQueryDto = z.infer<typeof savedListQuerySchema>;
