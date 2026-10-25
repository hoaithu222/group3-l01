import { z } from "zod";
import { paginationSchema } from "../../../shared/dto/common-schemas";

export const listChannelsQuerySchema = z.object({
  include: z.enum(["joined", "discover", "all"]).default("all"),
  type: z.enum(["TEXT", "VOICE", "POMODORO"]).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
export type ListChannelsQueryDto = z.infer<typeof listChannelsQuerySchema>;

export const listChannelMembersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
});
export type ListChannelMembersQueryDto = z.infer<typeof listChannelMembersQuerySchema>;

/** `GET /admin/workspaces/:id/channels` — lọc `status`/`type` phía server (chỉ đọc; admin.md §2.1 "Phân trang server"). Vắng = mọi trạng thái/loại. */
export const adminListChannelsQuerySchema = paginationSchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  type: z.enum(["TEXT", "VOICE", "POMODORO"]).optional(),
});
export type AdminListChannelsQueryDto = z.infer<typeof adminListChannelsQuerySchema>;
