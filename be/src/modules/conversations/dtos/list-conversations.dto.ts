import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** be.md §3 — `GET /conversations`. */
export const listConversationsQuerySchema = z.object({
  filter: z.enum(["all", "unread", "direct", "group", "pinned", "archived"]).default("all"),
  q: z.string().trim().min(1).max(100).optional(),
  workspaceId: objectIdSchema.optional(),
  cursor: z.string().max(200).optional(), // encodeCursor({ at: activityAt, id: memberId })
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListConversationsQueryDto = z.infer<typeof listConversationsQuerySchema>;

/** be.md §3 — `GET /conversations/people`. */
export const peopleQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  workspaceId: objectIdSchema.optional(),
});
export type PeopleQueryDto = z.infer<typeof peopleQuerySchema>;
